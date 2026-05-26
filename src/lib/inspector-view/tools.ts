import { estimateTokens } from '#/lib/format'
import { formatJson, type JsonValue } from '#/lib/json'
import type { Span } from '#/lib/spans'
import { isAgentSpan, isChatSpan, spanHasError } from './predicates'

type ToolGroupKind = 'server' | 'default'

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

export interface FrontendTool {
  id: string
  name: string
  description: string
  raw: JsonValue
  tokens: number
}

export interface ToolCallResolution {
  subAgent?: Span
  result?: JsonValue
  success: boolean
}

const DEFAULT_LABEL = 'tools'

// Union chat + invoke_agent definitions (chat copies are often truncated).
// Backfill from executed tool spans for tools that fell off the truncated list.
export function collectToolGroups(spans: Span[]): ToolGroup[] {
  const byKey = new Map<string, ToolDef & { kind: ToolGroupKind }>()
  for (const span of spans) {
    if (!isChatSpan(span) && !isAgentSpan(span)) continue
    if (span.toolDefinitions == null) continue
    for (const raw of flattenToolDefinitions(span.toolDefinitions)) {
      const name = toolName(raw)
      const description = toolDescription(raw)
      const explicit = toolDomain(raw)
      const kind: ToolGroupKind = explicit ? 'server' : 'default'
      const domain = explicit ?? DEFAULT_LABEL
      const key = `${kind}:${domain}:${name}:${description}`
      if (byKey.has(key)) continue
      byKey.set(key, { id: key, name, domain, kind, description, tokens: estimateTokens(formatJson(raw)), raw })
    }
  }

  const definedNames = new Set([...byKey.values()].map((t) => t.name))
  for (const span of spans) {
    if (span.operation !== 'tool' || !span.toolName) continue
    const name = span.toolName
    if (definedNames.has(name)) continue
    definedNames.add(name)
    const parts = name.split('.')
    const explicit = parts.length > 2 ? parts.slice(0, -1).join('.') : undefined
    const kind: ToolGroupKind = explicit ? 'server' : 'default'
    const domain = explicit ?? DEFAULT_LABEL
    const key = `${kind}:${domain}:${name}`
    byKey.set(key, { id: key, name, domain, kind, description: '', tokens: 0, raw: { type: 'function', name } })
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
    .sort((a, b) => b.tokens - a.tokens || a.domain.localeCompare(b.domain))
}

// Defined but never executed → handled frontend-side (CopilotKit, etc.).
// Gated on at least one execute_tool span existing — without backend
// instrumentation, every defined tool would falsely look frontend.
export function collectFrontendTools(spans: Span[]): FrontendTool[] {
  const backendExecuted = new Set<string>()
  for (const span of spans) {
    if (span.operation === 'tool' && span.toolName) backendExecuted.add(span.toolName)
  }
  if (backendExecuted.size === 0) return []

  const defs = new Map<string, { description: string; raw: JsonValue }>()
  for (const span of spans) {
    if (!isChatSpan(span) || span.toolDefinitions == null) continue
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

// Map each tool_call id → result + optional sub-agent linkage (the
// "agent as tool" pattern, where execute_tool wraps an invoke_agent).
export function resolveToolCalls(
  spans: Span[],
  childrenByParent: Map<string | null, Span[]>,
): Map<string, ToolCallResolution> {
  const map = new Map<string, ToolCallResolution>()
  for (const t of spans) {
    if (t.operation !== 'tool' || !t.toolCallId) continue
    const subAgent = childrenByParent.get(t.id)?.find(isAgentSpan)
    map.set(t.toolCallId, { subAgent, result: t.toolResult, success: !spanHasError(t) })
  }
  return map
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

function toolDomain(value: JsonValue): string | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined
  for (const key of ['domain', 'namespace', 'server', 'mcp_server', 'provider']) {
    const candidate = value[key]
    if (typeof candidate === 'string' && candidate) return candidate
  }
  return undefined
}
