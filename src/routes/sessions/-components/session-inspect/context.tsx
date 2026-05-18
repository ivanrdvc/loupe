import { useMemo, useState } from 'react'
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '#/components/ui/accordion'
import { Badge } from '#/components/ui/badge'
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from '#/components/ui/empty'
import { ScrollArea } from '#/components/ui/scroll-area'
import { asMessages } from '#/lib/conversation'
import { estimateTokens } from '#/lib/format'
import { formatJson, type JsonValue } from '#/lib/json'
import type { Span } from '#/lib/spans'
import { displayFor } from './shared'

type ContextTab = 'system' | 'agui'

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
type ToolGroupKind = 'frontend' | 'server' | 'default'

interface ToolDef {
  id: string
  name: string
  domain: string
  description: string
  tokens: number
  raw: JsonValue
}

interface ToolGroup {
  domain: string
  kind: ToolGroupKind
  tools: ToolDef[]
  tokens: number
}

interface AguiItem {
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

interface SystemHits {
  prompts: SystemBlock[]
  agui: AguiItem[]
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

// Tools whose name the LLM emitted in a tool_call, but which never appear as
// an execute_tool span — backend never handled them, so they were handled
// frontend-side (CopilotKit useFrontendTool / useHumanInTheLoop / etc.).
// Tool definitions look identical on the wire whether they're backend or
// frontend, so this differential is the only signal we have.
//
// Gate: requires at least one execute_tool span in the session. Some runtimes
// (e.g. the .NET Microsoft Agent Framework on AIFunctionFactory tools) don't
// emit execute_tool spans at all — without them, every called tool would
// falsely look frontend. When backend instrumentation is dark, we'd rather
// classify nothing than mislabel everything.
export function collectFrontendTools(spans: Span[]): FrontendTool[] {
  const backendExecuted = new Set<string>()
  for (const span of spans) {
    if (span.operation === 'tool' && span.toolName) backendExecuted.add(span.toolName)
  }
  if (backendExecuted.size === 0) return []

  const calledNames = new Set<string>()
  for (const span of spans) {
    if (span.operation !== 'chat') continue
    for (const msg of asMessages(span.llmOutput)) {
      for (const part of msg.parts) {
        if (part.kind === 'tool_call') calledNames.add(part.name)
      }
    }
  }

  const defs = new Map<string, { description: string; raw: JsonValue }>()
  for (const span of spans) {
    if (span.operation !== 'chat' || span.toolDefinitions == null) continue
    for (const raw of flattenToolDefinitions(span.toolDefinitions)) {
      const name = toolName(raw)
      if (!defs.has(name)) defs.set(name, { description: toolDescription(raw), raw })
    }
  }

  const out: FrontendTool[] = []
  for (const name of calledNames) {
    if (backendExecuted.has(name)) continue
    const def = defs.get(name)
    const raw: JsonValue = def?.raw ?? null
    out.push({
      id: `frontend-${name}`,
      name,
      description: def?.description ?? '',
      raw,
      tokens: raw != null ? estimateTokens(formatJson(raw)) : 0,
    })
  }
  return out.sort((a, b) => a.name.localeCompare(b.name))
}

function collectAguiItems(spans: Span[], extra: AguiItem[]): AguiItem[] {
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

export function SessionContextView({ spans }: { spans: Span[] }) {
  const [tab, setTab] = useState<ContextTab>('system')
  const systemHits = useMemo(() => collectSystemHits(spans), [spans])
  const systemBlocks = systemHits.prompts
  const aguiItems = useMemo(() => collectAguiItems(spans, systemHits.agui), [spans, systemHits.agui])
  const frontendTools = useMemo(() => collectFrontendTools(spans), [spans])
  const systemTokens = systemBlocks.reduce((sum, block) => sum + block.tokens, 0)

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="shrink-0 border-border border-b px-4 pt-2">
        <div className="text-sm font-semibold text-foreground">Context</div>
        <nav className="mt-1 flex gap-4" aria-label="Session context">
          {(
            [
              ['system', `System ${systemTokens ? `(${systemTokens.toLocaleString()})` : ''}`],
              ['agui', 'AG-UI'],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              onClick={() => setTab(id)}
              className={[
                'flex h-8 items-center border-b-2 px-0 text-sm font-medium transition-colors',
                tab === id
                  ? 'border-foreground text-foreground'
                  : 'border-transparent text-muted-foreground hover:text-foreground',
              ].join(' ')}
            >
              {label}
            </button>
          ))}
        </nav>
      </div>

      <ScrollArea className="min-h-0 flex-1">
        <div className="px-4 py-4">
          {tab === 'system' ? (
            <ContextSystem blocks={systemBlocks} />
          ) : (
            <ContextAgui items={aguiItems} frontendTools={frontendTools} />
          )}
        </div>
      </ScrollArea>
    </div>
  )
}

export function ContextSystem({ blocks }: { blocks: SystemBlock[] }) {
  if (blocks.length === 0) {
    return (
      <Empty className="border-0">
        <EmptyHeader>
          <EmptyTitle>No system prompt</EmptyTitle>
          <EmptyDescription>None of the chat spans carry a system message.</EmptyDescription>
        </EmptyHeader>
      </Empty>
    )
  }
  return (
    <Accordion type="multiple" defaultValue={blocks.length > 0 ? [blocks[0].id] : []}>
      {blocks.map((block) => (
        <AccordionItem key={block.id} value={block.id}>
          <AccordionTrigger>
            <span className="min-w-0 flex-1 truncate">{block.title}</span>
            <Badge variant="secondary" className="tabular-nums">
              {block.tokens.toLocaleString()} tok
            </Badge>
          </AccordionTrigger>
          <AccordionContent>
            <pre className="max-h-[28rem] overflow-auto whitespace-pre-wrap break-words text-xs leading-relaxed text-foreground">
              {block.content}
            </pre>
          </AccordionContent>
        </AccordionItem>
      ))}
    </Accordion>
  )
}

export function ContextTools({ groups }: { groups: ToolGroup[] }) {
  if (groups.length === 0) {
    return (
      <Empty className="border-0">
        <EmptyHeader>
          <EmptyTitle>No tool definitions</EmptyTitle>
          <EmptyDescription>The chat spans didn't advertise any tools.</EmptyDescription>
        </EmptyHeader>
      </Empty>
    )
  }
  const wrapped = groups.filter((g) => g.kind !== 'default')
  const flat = groups.find((g) => g.kind === 'default')?.tools ?? []
  return (
    <div className="space-y-3">
      {wrapped.length > 0 && (
        <Accordion type="multiple">
          {wrapped.map((group) => {
            const value = `${group.kind}:${group.domain}`
            return (
              <AccordionItem key={value} value={value}>
                <AccordionTrigger>
                  <span className="min-w-0 flex-1 truncate">{group.domain}</span>
                  <div className="flex shrink-0 items-center gap-1.5">
                    <Badge variant="secondary" className="tabular-nums">
                      {group.tools.length} tool{group.tools.length === 1 ? '' : 's'}
                    </Badge>
                    <Badge variant="outline" className="tabular-nums">
                      {group.tokens.toLocaleString()} tok
                    </Badge>
                  </div>
                </AccordionTrigger>
                <AccordionContent className="px-0">
                  <div className="divide-y divide-border border-border border-t">
                    {group.tools.map((tool) => (
                      <ToolRow key={tool.id} tool={tool} />
                    ))}
                  </div>
                </AccordionContent>
              </AccordionItem>
            )
          })}
        </Accordion>
      )}
      {flat.length > 0 && (
        <div className="divide-y divide-border overflow-hidden rounded-md border bg-muted/50">
          {flat.map((tool) => (
            <ToolRow key={tool.id} tool={tool} />
          ))}
        </div>
      )}
    </div>
  )
}

function ToolRow({ tool }: { tool: ToolDef }) {
  return (
    <details className="group">
      <summary className="grid cursor-pointer grid-cols-[minmax(0,1fr)_auto] gap-3 px-3 py-2 text-xs">
        <span className="min-w-0">
          <span className="block truncate font-medium text-foreground">{tool.name}</span>
          {tool.description && <span className="mt-0.5 block truncate text-muted-foreground">{tool.description}</span>}
        </span>
        <Badge variant="outline" className="tabular-nums">
          {tool.tokens.toLocaleString()} tok
        </Badge>
      </summary>
      <pre className="max-h-80 overflow-auto whitespace-pre-wrap break-words bg-card/70 px-3 py-2 text-xs leading-snug text-foreground">
        {formatJson(tool.raw)}
      </pre>
    </details>
  )
}

function isShortValue(value: string): boolean {
  return !value.includes('\n') && value.length < 120
}

function ContextAgui({ items, frontendTools }: { items: AguiItem[]; frontendTools: FrontendTool[] }) {
  if (items.length === 0 && frontendTools.length === 0) {
    return (
      <Empty className="border-0">
        <EmptyHeader>
          <EmptyTitle>No AG-UI context</EmptyTitle>
          <EmptyDescription>Didn't detect runtime/state context in this session.</EmptyDescription>
        </EmptyHeader>
      </Empty>
    )
  }
  const identifiers = items.filter((item) => isShortValue(item.value))
  const payloads = items.filter((item) => !isShortValue(item.value))
  return (
    <div className="space-y-4">
      {frontendTools.length > 0 && <FrontendToolsSection tools={frontendTools} />}

      {identifiers.length > 0 && (
        <dl className="overflow-hidden rounded-lg ring-1 ring-border">
          {identifiers.map((item, i) => (
            <div
              key={item.id}
              className={[
                'grid grid-cols-[max-content_minmax(0,1fr)] items-center gap-4 px-3 py-1.5 text-xs',
                i > 0 ? 'border-border border-t' : '',
              ].join(' ')}
            >
              <dt className="text-muted-foreground">{item.label}</dt>
              <dd className="truncate font-mono text-foreground" title={item.value}>
                {item.value}
              </dd>
            </div>
          ))}
        </dl>
      )}

      {payloads.length > 0 && (
        <Accordion type="multiple">
          {payloads.map((item) => (
            <AccordionItem key={item.id} value={item.id}>
              <AccordionTrigger>
                <span className="min-w-0 flex-1 truncate">{item.label}</span>
                <Badge variant="secondary" className="tabular-nums">
                  {item.tokens.toLocaleString()} tok
                </Badge>
              </AccordionTrigger>
              <AccordionContent>
                <pre className="max-h-80 overflow-auto whitespace-pre-wrap break-words text-xs leading-snug text-foreground">
                  {item.value}
                </pre>
              </AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
      )}
    </div>
  )
}

function FrontendToolsSection({ tools }: { tools: FrontendTool[] }) {
  return (
    <section>
      <header className="mb-2 flex items-baseline justify-between gap-2 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
        <span>Frontend tools</span>
        <span className="tabular-nums">{tools.length}</span>
      </header>
      <div className="divide-y divide-border overflow-hidden rounded-lg ring-1 ring-border">
        {tools.map((tool) => (
          <details key={tool.id} className="group">
            <summary className="grid cursor-pointer grid-cols-[minmax(0,1fr)_auto] gap-3 px-3 py-2 text-xs">
              <span className="min-w-0">
                <span className="block truncate font-medium text-foreground">{tool.name}</span>
                {tool.description && (
                  <span className="mt-0.5 block truncate text-muted-foreground">{tool.description}</span>
                )}
              </span>
              <span className="tabular-nums text-muted-foreground">
                {tool.tokens ? `${tool.tokens.toLocaleString()} tok` : '—'}
              </span>
            </summary>
            {tool.raw != null && (
              <pre className="max-h-80 overflow-auto whitespace-pre-wrap break-words bg-card/70 px-3 py-2 text-xs leading-snug text-foreground">
                {formatJson(tool.raw)}
              </pre>
            )}
          </details>
        ))}
      </div>
    </section>
  )
}
