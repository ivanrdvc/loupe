import { asMessages } from '#/lib/conversation'
import { estimateTokens } from '#/lib/format'
import { formatJson, type JsonValue } from '#/lib/json'
import type { Span } from '#/lib/spans'
import { displayFor } from './shared'

export interface SystemBlock {
  id: string
  title: string
  content: string
  tokens: number
}

// Group kinds drive layout: 'frontend' pins to the top, 'server' renders as a
// named collapsible group, 'default' is the unnamed catch-all flat list.
// Using a discriminator instead of comparing the display string avoids a
// collision if a real MCP server is literally named 'frontend' or 'tools'.
export type ToolGroupKind = 'frontend' | 'server' | 'default'

export interface ToolDef {
  id: string
  name: string
  domain: string
  description: string
  tokens: number
  raw: JsonValue
}

export interface ToolGroup {
  domain: string
  kind: ToolGroupKind
  tools: ToolDef[]
  tokens: number
}

export interface AguiItem {
  id: string
  label: string
  value: string
  tokens: number
}

export interface FrontendTool {
  id: string
  name: string
  description: string
  raw: JsonValue
  tokens: number
}

export interface SystemHits {
  prompts: SystemBlock[]
  agui: AguiItem[]
}

// Distinguish a real agent system prompt from runtime/state-sync scaffolding
// that AG-UI middleware (e.g. CopilotKit) injects as `role: system` messages
// each turn — JSON state snapshots, "Here is the current state…", summarize
// directives. The two belong in different tabs.
function classifySystemContent(content: string): 'prompt' | 'agui' {
  const trimmed = content.trim()
  if (!trimmed) return 'prompt'
  if (/^[{[]/.test(trimmed)) return 'agui'
  if (/\b(current state|new state|state changes|state in json|state update|summary of the state)\b/i.test(trimmed)) {
    return 'agui'
  }
  return 'prompt'
}

export function collectSystemHits(spans: Span[]): SystemHits {
  const prompts: SystemBlock[] = []
  const agui: AguiItem[] = []
  const seenPrompt = new Set<string>()
  const seenAgui = new Set<string>()
  for (const span of spans) {
    if (span.operation !== 'chat') continue
    const messages = asMessages(span.llmInput).filter((message) => message.role === 'system')
    for (const message of messages) {
      const content = message.parts
        .filter((part) => part.kind === 'text')
        .map((part) => part.content)
        .join('\n\n')
        .trim()
      if (!content) continue
      const kind = classifySystemContent(content)
      if (kind === 'prompt') {
        if (seenPrompt.has(content)) continue
        seenPrompt.add(content)
        prompts.push({
          id: `${span.id}-${prompts.length}`,
          title: span.model ?? displayFor(span).name,
          content,
          tokens: estimateTokens(content),
        })
      } else {
        if (seenAgui.has(content)) continue
        seenAgui.add(content)
        agui.push({
          id: `${span.id}-sys-${agui.length}`,
          label: aguiLabelFor(content),
          value: content,
          tokens: estimateTokens(content),
        })
      }
    }
  }
  return { prompts, agui }
}

function aguiLabelFor(content: string): string {
  const trimmed = content.trim()
  if (/^[{[]/.test(trimmed)) return 'State payload'
  if (/\b(summary of the state|summarize)\b/i.test(trimmed)) return 'Summarize directive'
  if (/\b(new state|state changes|state update)\b/i.test(trimmed)) return 'State update directive'
  if (/\b(current state|state in json)\b/i.test(trimmed)) return 'State directive'
  return 'Directive'
}

const FRONTEND_LABEL = 'frontend'
const DEFAULT_LABEL = 'tools'

export function collectToolGroups(spans: Span[], frontendNames?: Set<string>): ToolGroup[] {
  const byKey = new Map<string, ToolDef & { kind: ToolGroupKind }>()
  for (const span of spans) {
    if (span.operation !== 'chat' || span.toolDefinitions == null) continue
    for (const raw of flattenToolDefinitions(span.toolDefinitions)) {
      const name = toolName(raw)
      const description = toolDescription(raw)
      const isFrontend = frontendNames?.has(name) ?? false
      const explicit = toolDomain(raw)
      const kind: ToolGroupKind = isFrontend ? 'frontend' : explicit ? 'server' : 'default'
      const domain = isFrontend ? FRONTEND_LABEL : (explicit ?? DEFAULT_LABEL)
      const text = formatJson(raw)
      // Key includes kind so a hypothetical server literally named 'frontend'
      // can't merge into the pinned frontend group.
      const key = `${kind}:${domain}:${name}:${description}`
      if (byKey.has(key)) continue
      byKey.set(key, {
        id: key,
        name,
        domain,
        kind,
        description,
        tokens: estimateTokens(text),
        raw,
      })
    }
  }

  const groups = new Map<string, { domain: string; kind: ToolGroupKind; tools: ToolDef[] }>()
  for (const tool of byKey.values()) {
    const groupKey = `${tool.kind}:${tool.domain}`
    const existing = groups.get(groupKey) ?? { domain: tool.domain, kind: tool.kind, tools: [] }
    existing.tools.push(tool)
    groups.set(groupKey, existing)
  }
  return [...groups.values()]
    .map((g) => ({
      ...g,
      tools: g.tools.sort((a, b) => a.name.localeCompare(b.name)),
      tokens: g.tools.reduce((sum, tool) => sum + tool.tokens, 0),
    }))
    .sort((a, b) => {
      // Frontend pinned first; everything else by token weight, alpha tiebreak.
      if (a.kind === 'frontend') return -1
      if (b.kind === 'frontend') return 1
      return b.tokens - a.tokens || a.domain.localeCompare(b.domain)
    })
}

// Tools that are defined in the chat span's toolDefinitions but never appear
// as an execute_tool span — backend never handled them, so they were handled
// frontend-side (CopilotKit useFrontendTool / useHumanInTheLoop / etc.).
// Tool definitions look identical on the wire whether they're backend or
// frontend, so this differential is the only signal we have.
//
// Gate: requires at least one execute_tool span in the session. Some runtimes
// (e.g. the .NET Microsoft Agent Framework on AIFunctionFactory tools) don't
// emit execute_tool spans at all — without them, every defined tool would
// falsely look frontend. When backend instrumentation is dark, we'd rather
// classify nothing than mislabel everything.
export function collectFrontendTools(spans: Span[]): FrontendTool[] {
  const backendExecuted = new Set<string>()
  for (const span of spans) {
    if (span.operation === 'tool' && span.toolName) backendExecuted.add(span.toolName)
  }
  if (backendExecuted.size === 0) return []

  const defs = new Map<string, { description: string; raw: JsonValue }>()
  for (const span of spans) {
    if (span.operation !== 'chat' || span.toolDefinitions == null) continue
    for (const raw of flattenToolDefinitions(span.toolDefinitions)) {
      const name = toolName(raw)
      if (!defs.has(name)) defs.set(name, { description: toolDescription(raw), raw })
    }
  }

  const out: FrontendTool[] = []
  for (const [name, def] of defs) {
    if (backendExecuted.has(name)) continue
    out.push({
      id: `frontend-${name}`,
      name,
      description: def.description,
      raw: def.raw,
      tokens: estimateTokens(formatJson(def.raw)),
    })
  }
  return out.sort((a, b) => a.name.localeCompare(b.name))
}

export function collectAguiItems(spans: Span[], extra: AguiItem[]): AguiItem[] {
  const items: AguiItem[] = []
  const sessionIds = new Set(spans.map((span) => span.sessionId).filter((id): id is string => !!id))
  for (const id of sessionIds) {
    items.push({
      id: `session-${id}`,
      label: 'Session / thread id',
      value: id,
      tokens: estimateTokens(id),
    })
  }

  const seen = new Set<string>()
  for (const span of spans) {
    if (span.operation !== 'chat') continue
    for (const hit of findAguiValues(span.llmInput)) {
      const key = `${hit.label}:${hit.value}`
      if (seen.has(key)) continue
      seen.add(key)
      items.push({
        id: `${span.id}-${items.length}`,
        label: hit.label,
        value: hit.value,
        tokens: estimateTokens(hit.value),
      })
    }
  }
  for (const item of extra) {
    const key = `${item.label}:${item.value}`
    if (seen.has(key)) continue
    seen.add(key)
    items.push(item)
  }
  return items
}

function flattenToolDefinitions(value: JsonValue): JsonValue[] {
  if (Array.isArray(value)) return value
  if (value && typeof value === 'object') {
    if (Array.isArray(value.tools)) return value.tools
    if (Array.isArray(value.functions)) return value.functions
  }
  return [value]
}

function toolName(value: JsonValue): string {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return 'tool'
  const fn = value.function
  if (fn && typeof fn === 'object' && !Array.isArray(fn) && typeof fn.name === 'string') return fn.name
  if (typeof value.name === 'string') return value.name
  if (typeof value.title === 'string') return value.title
  return 'tool'
}

function toolDescription(value: JsonValue): string {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return ''
  const fn = value.function
  if (fn && typeof fn === 'object' && !Array.isArray(fn) && typeof fn.description === 'string') return fn.description
  if (typeof value.description === 'string') return value.description
  return ''
}

// Returns an explicit server/namespace string when the tool def carries one
// (rare today — OpenAI-style payloads don't), or undefined otherwise. The
// caller decides which catch-all the tool falls into.
function toolDomain(value: JsonValue): string | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined
  for (const key of ['domain', 'namespace', 'server', 'mcp_server', 'provider']) {
    const candidate = value[key]
    if (typeof candidate === 'string' && candidate) return candidate
  }
  return undefined
}

function findAguiValues(value: JsonValue | undefined, path: string[] = []): { label: string; value: string }[] {
  if (value == null) return []
  if (typeof value !== 'object') {
    const label = path.join('.')
    if (/(^|\.)(ag_ui|agui|thread|runtime|context|state)(\.|$)/i.test(label)) {
      return [{ label, value: String(value) }]
    }
    return []
  }
  if (Array.isArray(value)) {
    return value.flatMap((item, index) => findAguiValues(item, [...path, String(index)]))
  }
  const out: { label: string; value: string }[] = []
  for (const [key, child] of Object.entries(value)) {
    const nextPath = [...path, key]
    const keyLooksRelevant = /(ag_ui|agui|thread|runtime|context|state)/i.test(key)
    if (keyLooksRelevant) {
      out.push({ label: nextPath.join('.'), value: formatJson(child) })
    } else {
      out.push(...findAguiValues(child, nextPath))
    }
  }
  return out
}

export function isShortValue(value: string): boolean {
  return !value.includes('\n') && value.length < 120
}
