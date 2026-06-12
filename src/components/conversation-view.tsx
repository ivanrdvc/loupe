import { ArrowDown, ChevronDown, ChevronRight, Eye, EyeOff } from 'lucide-react'
import { useCallback, useMemo, useState } from 'react'
import { StickToBottom, useStickToBottomContext } from 'use-stick-to-bottom'
import { JsonView } from '#/components/ai-elements/json-view'
import { CopyButton } from '#/components/copy-button'
import { Markdown } from '#/components/markdown'
import { ScaffoldGroup } from '#/components/scaffold-group'
import { Badge } from '#/components/ui/badge'
import type { ConversationEvent, InspectorView } from '#/features/inspect'
import { groupScaffolding, type RenderItem } from '#/lib/agui-scaffolding'
import { formatTime, formatTokens, metricTone, tokensFromChars } from '#/lib/format'
import { prettyJson } from '#/lib/json'
import { ACCENT, toolTone } from '#/lib/tone'

interface ConversationViewProps {
  view: InspectorView
  onSelect: (id: string) => void
}

interface EventContext {
  selectedKey: string | null
  expanded: Set<string>
  resultByCallId: Map<string, Extract<ConversationEvent, { kind: 'tool_result' }>>
  childrenByParent: Map<string, ConversationEvent[]>
  agentLabels: Map<string, string>
  selectEvent: (key: string, spanId: string | undefined) => void
  toggle: (id: string) => void
}

export function ConversationView({ view, onSelect }: ConversationViewProps) {
  const events = view.conversation
  const agentLabels = view.agentLabels

  const { topLevel, childrenByParent, resultByCallId } = useMemo(() => {
    const top: ConversationEvent[] = []
    const children = new Map<string, ConversationEvent[]>()
    const resultByCall = new Map<string, Extract<ConversationEvent, { kind: 'tool_result' }>>()
    for (const e of events) {
      if (e.kind === 'tool_result') resultByCall.set(e.callId, e)
      const parent = 'parentAgentSpanId' in e ? e.parentAgentSpanId : undefined
      if (parent) {
        const arr = children.get(parent) ?? []
        arr.push(e)
        children.set(parent, arr)
      } else {
        top.push(e)
      }
    }
    return { topLevel: top, childrenByParent: children, resultByCallId: resultByCall }
  }, [events])

  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const toggle = (id: string) =>
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })

  const [selectedKey, setSelectedKey] = useState<string | null>(null)
  const selectEvent = (key: string, spanId: string | undefined) => {
    setSelectedKey(key)
    if (spanId) onSelect(spanId)
  }

  const { turns, orchestratorCount, hasScaffolding } = useMemo(() => {
    const order: (string | undefined)[] = []
    const buckets = new Map<string | undefined, ConversationEvent[]>()
    for (const e of topLevel) {
      const key = e.orchestratorSpanId
      let arr = buckets.get(key)
      if (!arr) {
        arr = []
        buckets.set(key, arr)
        order.push(key)
      }
      arr.push(e)
    }
    const nameFor = (id: string) => view.agentLabels.get(id) ?? view.byId.get(id)?.agentName ?? 'Agent'
    let scaffolded = false
    const built: ConvTurn[] = order.map((key, i) => {
      const evs = buckets.get(key) ?? []
      const body = evs.filter((e) => !isLeadMessage(e))
      const scaffoldItems = groupScaffolding(body)
      if (scaffoldItems.some((it) => it.kind === 'scaffold_group')) scaffolded = true
      return {
        key: key ?? `flat-${i}`,
        orchestratorSpanId: key,
        label: key ? nameFor(key) : undefined,
        lead: evs.filter(isLeadMessage),
        body,
        scaffoldItems,
      }
    })
    return { turns: built, orchestratorCount: order.filter((k) => k !== undefined).length, hasScaffolding: scaffolded }
  }, [topLevel, view])

  // Escape hatch when the scaffolding detector misclassifies: render every message raw.
  const [showAll, setShowAll] = useState(false)

  if (events.length === 0) {
    return (
      <div className="px-3 py-6 text-center text-sm text-muted-foreground/70">No conversation data in this run.</div>
    )
  }

  const ctx: EventContext = {
    selectedKey,
    expanded,
    resultByCallId,
    childrenByParent,
    agentLabels,
    selectEvent,
    toggle,
  }

  return (
    <StickToBottom className="relative h-full overflow-hidden" resize="smooth" initial="instant">
      <StickToBottom.Content
        scrollClassName="overflow-y-auto"
        className={`flex min-h-full flex-col gap-3 px-3 ${hasScaffolding ? 'pt-12' : 'pt-3'} pb-16 sm:px-4`}
      >
        {turns.map((turn) => (
          <TurnView key={turn.key} turn={turn} showHeader={orchestratorCount > 1} showAll={showAll} ctx={ctx} />
        ))}
      </StickToBottom.Content>
      {hasScaffolding && <ShowAllToggle showAll={showAll} onToggle={() => setShowAll((v) => !v)} />}
      <ConversationScrollButton />
    </StickToBottom>
  )
}

interface ConvTurn {
  key: string
  orchestratorSpanId: string | undefined
  label: string | undefined
  lead: ConversationEvent[]
  body: ConversationEvent[]
  scaffoldItems: RenderItem[]
}

const isLeadMessage = (e: ConversationEvent): boolean => e.kind === 'message' && e.role === 'user'

// Header only when a session has >1 orchestrator; single/none renders without it.
function TurnView({
  turn,
  showHeader,
  showAll,
  ctx,
}: {
  turn: ConvTurn
  showHeader: boolean
  showAll: boolean
  ctx: EventContext
}) {
  const items = showAll ? turn.body.map((event): RenderItem => ({ kind: 'event', event })) : turn.scaffoldItems
  return (
    <div className="flex flex-col gap-3">
      {turn.lead.map((event) => renderEvent(event, ctx))}
      {turn.body.length > 0 &&
        (turn.orchestratorSpanId ? (
          <div className="flex flex-col gap-3 border-l-2 border-border/40 pl-3">
            {showHeader && turn.label && (
              <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                <span className="gradient-text font-bold" aria-hidden>
                  ✦
                </span>
                {turn.label}
              </div>
            )}
            {renderItems(items, ctx)}
          </div>
        ) : (
          renderItems(items, ctx)
        ))}
    </div>
  )
}

function renderItems(items: RenderItem[], ctx: EventContext) {
  return items.map((item) =>
    item.kind === 'scaffold_group' ? (
      <ScaffoldGroup
        key={`scaffold-${item.messages[0].spanId ?? item.messages[0].timestamp}-${item.messages[0].seq}`}
        messages={item.messages}
      />
    ) : (
      renderEvent(item.event, ctx)
    ),
  )
}

function ShowAllToggle({ showAll, onToggle }: { showAll: boolean; onToggle: () => void }) {
  const Icon = showAll ? EyeOff : Eye
  return (
    <button
      type="button"
      onClick={onToggle}
      title={showAll ? 'Hide AG-UI scaffolding' : 'Show all messages including scaffolding'}
      className="absolute right-3 top-3 z-10 inline-flex items-center gap-1.5 rounded-md border bg-background/90 px-2 py-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground shadow-sm hover:bg-accent hover:text-foreground"
    >
      <Icon className="size-3" aria-hidden />
      {showAll ? 'Hide scaffolding' : 'Show all'}
    </button>
  )
}

function ConversationScrollButton() {
  const { isAtBottom, scrollToBottom } = useStickToBottomContext()
  const handleScrollToBottom = useCallback(() => {
    scrollToBottom()
  }, [scrollToBottom])

  if (isAtBottom) return null

  return (
    <button
      type="button"
      aria-label="Jump to latest"
      onClick={handleScrollToBottom}
      className="absolute bottom-4 left-[50%] z-10 inline-flex size-9 translate-x-[-50%] items-center justify-center rounded-full border bg-background text-foreground shadow-md hover:bg-accent"
    >
      <ArrowDown className="size-4 fill-current" aria-hidden />
    </button>
  )
}

function renderEvent(event: ConversationEvent, ctx: EventContext) {
  if (event.kind === 'tool_result') return null

  if (event.kind === 'message') {
    if (event.role === 'system') return null
    const key = `msg-${event.spanId ?? ''}-${event.seq}`
    return <MessageBubble key={key} event={event} />
  }

  if (event.kind === 'tool_call') {
    const key = `call-${event.callId}`
    const result = ctx.resultByCallId.get(event.callId)
    return (
      <ToolCard
        key={key}
        call={event}
        result={result}
        expanded={ctx.expanded.has(event.callId)}
        onToggle={() => ctx.toggle(event.callId)}
        selected={ctx.selectedKey === key}
        onSelect={() => ctx.selectEvent(key, event.spanId)}
      />
    )
  }

  if (event.kind === 'agent_call') {
    const key = `agent-${event.spanId}`
    const nested = ctx.childrenByParent.get(event.spanId) ?? []
    return (
      <AgentCard
        key={key}
        event={event}
        nested={nested}
        expanded={ctx.expanded.has(event.spanId)}
        onToggle={() => ctx.toggle(event.spanId)}
        selected={ctx.selectedKey === key}
        onSelect={() => ctx.selectEvent(key, event.spanId)}
        ctx={ctx}
      />
    )
  }

  return null
}

interface MessageBubbleProps {
  event: Extract<ConversationEvent, { kind: 'message' }>
}

function MessageBubble({ event }: MessageBubbleProps) {
  const isUser = event.role === 'user'
  const hasTokens = event.inputTokens !== undefined || event.outputTokens !== undefined

  if (isUser) {
    return (
      <div className="flex items-start justify-end">
        <div className="max-w-[75%] rounded-2xl rounded-tr-sm bg-muted px-3 py-2 text-sm text-foreground">
          <Markdown>{event.content}</Markdown>
          <div className="mt-1 flex items-center justify-end gap-1 text-[10px] text-muted-foreground">
            <span>{formatTime(event.timestamp)}</span>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="group flex w-fit max-w-[85%] items-start gap-1.5 px-2 py-1 text-sm">
      <div className="min-w-0">
        {event.role !== 'assistant' && (
          <div className="mb-0.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            {event.role}
          </div>
        )}
        <Markdown>{event.content}</Markdown>
        <div className="mt-1 flex items-center gap-2 text-[10px] text-muted-foreground">
          <span>{formatTime(event.timestamp)}</span>
          {hasTokens && (
            <>
              <span aria-hidden>•</span>
              <TokenBadge input={event.inputTokens} output={event.outputTokens} />
            </>
          )}
        </div>
      </div>
    </div>
  )
}

function TokenBadge({ input, output }: { input?: number; output?: number }) {
  const total = (input ?? 0) + (output ?? 0)
  const neutral = 'text-muted-foreground'
  return (
    <span className="inline-flex items-center gap-1 font-mono">
      {input !== undefined && <span className={metricTone('tokens', input, neutral)}>↑{input}</span>}
      {output !== undefined && <span className={metricTone('tokens', output, neutral)}>↓{output}</span>}
      <span>({total} tokens)</span>
    </span>
  )
}

interface ToolCardProps {
  call: Extract<ConversationEvent, { kind: 'tool_call' }>
  result?: Extract<ConversationEvent, { kind: 'tool_result' }>
  expanded: boolean
  onToggle: () => void
  selected: boolean
  onSelect: () => void
}

function ToolCard({ call, result, expanded, onToggle, selected, onSelect }: ToolCardProps) {
  const status = !result ? 'pending' : result.success ? 'completed' : 'failed'
  const argumentTokens = tokensFromChars(prettyJson(call.arguments).length)
  const resultTokens = result ? tokensFromChars(prettyJson(result.result).length) : undefined
  const tone = toolTone('tool')

  return (
    <div className={['rounded-lg border text-sm', selected ? tone.selectedBorder : tone.border].join(' ')}>
      <button
        type="button"
        onClick={() => {
          onToggle()
          onSelect()
        }}
        className={`flex w-full items-center gap-2 rounded-lg px-3 py-1.5 text-left ${tone.hoverBg}`}
      >
        <span
          className={`inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium ${tone.badge}`}
        >
          <tone.icon className="size-3" />
          {tone.label}
        </span>
        <span className={`truncate font-mono text-xs font-medium ${ACCENT.violet.ident}`}>{call.toolName}</span>
        <StatusPill status={status} />
        <span className="ml-auto flex shrink-0 items-center gap-2 text-[11px] text-muted-foreground">
          <ToolTokenBadge input={argumentTokens} output={resultTokens} />
          <span>{formatTime(call.timestamp)}</span>
          {expanded ? <ChevronDown className="size-3" aria-hidden /> : <ChevronRight className="size-3" aria-hidden />}
        </span>
      </button>

      {expanded && (
        <div className="space-y-2 border-t border-border px-3 py-2">
          <KeyValueBlock label="Arguments" value={call.arguments} />
          {result && <KeyValueBlock label="Result" value={result.result} />}
          {result?.error && (
            <div className="rounded border border-destructive/30 bg-destructive/5 px-2 py-1 text-[11px] text-destructive">
              <span className="font-semibold">{result.error.kind}</span>
              {result.error.message && <span>: {result.error.message}</span>}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function ToolTokenBadge({ input, output }: { input: number; output?: number }) {
  const neutral = 'text-muted-foreground'
  return (
    <span className="inline-flex items-center gap-1 font-mono" title="Estimated tool payload tokens">
      <span className={metricTone('tokens', input, neutral)}>↑{formatTokens(input)}</span>
      {output !== undefined && <span className={metricTone('tokens', output, neutral)}>↓{formatTokens(output)}</span>}
      <span className="text-muted-foreground">est</span>
    </span>
  )
}

interface AgentCardProps {
  event: Extract<ConversationEvent, { kind: 'agent_call' }>
  nested: ConversationEvent[]
  expanded: boolean
  onToggle: () => void
  selected: boolean
  onSelect: () => void
  ctx: EventContext
}

function AgentCard({ event, nested, expanded, onToggle, selected, onSelect, ctx }: AgentCardProps) {
  // A sub-agent's input/result already capture what we care about. The chat
  // messages from inside the sub-agent are duplicate noise from the parent's
  // POV — only surface the *actions* the sub-agent took (tool calls + nested
  // agent calls).
  const actions = useMemo(() => nested.filter((e) => e.kind === 'tool_call' || e.kind === 'agent_call'), [nested])
  const hasActions = actions.length > 0
  const inputTokens = tokensFromChars(prettyJson(event.input).length)
  const outputTokens = tokensFromChars(prettyJson(event.result).length)
  const tone = toolTone('agent')

  return (
    <div className={['rounded-lg border text-sm', selected ? tone.selectedBorder : tone.border].join(' ')}>
      <button
        type="button"
        onClick={() => {
          onToggle()
          onSelect()
        }}
        className={`flex w-full items-center gap-2 rounded-lg px-3 py-1.5 text-left ${tone.hoverBg}`}
      >
        <span
          className={`inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium ${tone.badge}`}
        >
          <tone.icon className="size-3" />
          {tone.label}
        </span>
        <span className={`truncate font-mono text-xs font-medium ${ACCENT.emerald.ident}`}>
          {ctx.agentLabels.get(event.spanId) ?? event.agentName}
        </span>
        {hasActions && (
          <span className="text-[10px] text-muted-foreground">
            ({actions.length} action{actions.length === 1 ? '' : 's'})
          </span>
        )}
        <span className="ml-auto flex shrink-0 items-center gap-2 text-[11px] text-muted-foreground">
          <ToolTokenBadge input={inputTokens} output={outputTokens} />
          <span>{formatTime(event.timestamp)}</span>
          {expanded ? <ChevronDown className="size-3" aria-hidden /> : <ChevronRight className="size-3" aria-hidden />}
        </span>
      </button>

      {expanded && (
        <div className={`space-y-2 border-t px-3 py-2 ${tone.border}`}>
          <KeyValueBlock label="Input" value={event.input} />
          <KeyValueBlock label="Output" value={event.result} />
          {hasActions && (
            <div className="space-y-2 border-t border-border pt-2">
              <div className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Actions</div>
              <div className="flex flex-col gap-2">{actions.map((c) => renderEvent(c, ctx))}</div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function StatusPill({ status }: { status: 'pending' | 'completed' | 'failed' }) {
  const variant = status === 'completed' ? 'success' : status === 'failed' ? 'destructive' : 'secondary'
  const label = status === 'completed' ? '✓ Completed' : status === 'failed' ? '✗ Failed' : '⋯ Pending'
  return <Badge variant={variant}>{label}</Badge>
}

function KeyValueBlock({ label, value }: { label: string; value: unknown }) {
  const formatted = prettyJson(value)
  return (
    <div className="group/kv relative">
      <div className="mb-1 flex items-center justify-between gap-2">
        <div className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{label}</div>
        <CopyButton value={formatted} className="opacity-0 transition-opacity group-hover/kv:opacity-100" />
      </div>
      <JsonView value={value} className="max-h-72" />
    </div>
  )
}
