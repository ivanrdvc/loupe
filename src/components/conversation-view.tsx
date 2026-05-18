import { ArrowDownIcon, ChevronDownIcon, ChevronRightIcon, EyeIcon, EyeSlashIcon } from '@heroicons/react/16/solid'
import { useCallback, useMemo, useState } from 'react'
import { StickToBottom, useStickToBottomContext } from 'use-stick-to-bottom'
import { CopyButton } from '#/components/copy-button'
import { Markdown } from '#/components/markdown'
import { ScaffoldGroup } from '#/components/scaffold-group'
import { Badge } from '#/components/ui/badge'
import { groupScaffolding } from '#/lib/agui-scaffolding'
import { buildConversation, type ConversationEvent } from '#/lib/conversation'
import { estimateTokens, formatTime, formatTokens, metricTone } from '#/lib/format'
import type { Span } from '#/lib/spans'

interface ConversationViewProps {
  spans: Span[]
  onSelect: (id: string) => void
}

interface EventContext {
  selectedKey: string | null
  expanded: Set<string>
  resultByCallId: Map<string, Extract<ConversationEvent, { kind: 'tool_result' }>>
  childrenByParent: Map<string, ConversationEvent[]>
  selectEvent: (key: string, spanId: string | undefined) => void
  toggle: (id: string) => void
}

export function ConversationView({ spans, onSelect }: ConversationViewProps) {
  const events = useMemo(() => buildConversation(spans), [spans])

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

  const items = useMemo(() => groupScaffolding(topLevel), [topLevel])
  // Escape hatch for when the scaffolding detector misclassifies — render
  // every message raw, no folding. The classifier is a content heuristic and
  // will drift as CopilotKit changes its prompts.
  const [showAll, setShowAll] = useState(false)
  const hasScaffolding = useMemo(() => items.some((i) => i.kind === 'scaffold_group'), [items])

  if (events.length === 0) {
    return (
      <div className="px-3 py-6 text-center text-sm text-muted-foreground/70">No conversation data in this run.</div>
    )
  }

  const ctx: EventContext = { selectedKey, expanded, resultByCallId, childrenByParent, selectEvent, toggle }

  return (
    <StickToBottom className="relative h-full overflow-hidden" resize="smooth" initial="instant">
      <StickToBottom.Content
        scrollClassName="overflow-y-auto"
        className={`flex min-h-full flex-col gap-3 px-3 ${hasScaffolding ? 'pt-12' : 'pt-3'} pb-16 sm:px-4`}
      >
        {showAll
          ? topLevel.map((event) => renderEvent(event, ctx))
          : items.map((item) =>
              item.kind === 'scaffold_group' ? (
                <ScaffoldGroup
                  key={`scaffold-${item.messages[0].spanId ?? item.messages[0].timestamp}-${item.messages[0].seq}`}
                  messages={item.messages}
                />
              ) : (
                renderEvent(item.event, ctx)
              ),
            )}
      </StickToBottom.Content>
      {hasScaffolding && <ShowAllToggle showAll={showAll} onToggle={() => setShowAll((v) => !v)} />}
      <ConversationScrollButton />
    </StickToBottom>
  )
}

function ShowAllToggle({ showAll, onToggle }: { showAll: boolean; onToggle: () => void }) {
  return (
    <button
      type="button"
      onClick={onToggle}
      title={showAll ? 'Hide AG-UI scaffolding' : 'Show all messages including scaffolding'}
      className="absolute right-3 top-3 z-10 inline-flex items-center gap-1.5 rounded-md border bg-background/90 px-2 py-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground shadow-sm hover:bg-accent hover:text-foreground"
    >
      {showAll ? <EyeSlashIcon className="size-3" /> : <EyeIcon className="size-3" />}
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
      <ArrowDownIcon className="size-4 fill-current" />
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

  if (event.kind === 'utility_chat') return null

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
  const argumentTokens = estimateTokens(formatValue(call.arguments))
  const resultTokens = result ? estimateTokens(formatValue(result.result)) : undefined

  return (
    <div className={['rounded-md border text-sm', selected ? 'border-primary' : 'border-border'].join(' ')}>
      <button
        type="button"
        onClick={() => {
          onToggle()
          onSelect()
        }}
        className="flex w-full items-center gap-2 rounded-md px-3 py-1.5 text-left hover:bg-accent"
      >
        <span className="text-muted-foreground">⚒</span>
        <span className="truncate font-medium text-foreground">{call.toolName}</span>
        <StatusPill status={status} />
        <span className="ml-auto flex shrink-0 items-center gap-2 text-[11px] text-muted-foreground">
          <ToolTokenBadge input={argumentTokens} output={resultTokens} />
          <span>{formatTime(call.timestamp)}</span>
          {expanded ? <ChevronDownIcon className="size-3" /> : <ChevronRightIcon className="size-3" />}
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
  const inputTokens = estimateTokens(formatValue(event.input))
  const outputTokens = estimateTokens(formatValue(event.result))

  return (
    <div
      className={[
        'rounded-md border text-sm',
        selected
          ? 'border-emerald-500/60 dark:border-emerald-400/60'
          : 'border-emerald-500/30 dark:border-emerald-400/30',
      ].join(' ')}
    >
      <button
        type="button"
        onClick={() => {
          onToggle()
          onSelect()
        }}
        className="flex w-full items-center gap-2 rounded-md px-3 py-1.5 text-left hover:bg-emerald-500/5 dark:hover:bg-emerald-400/5"
      >
        <span className="rounded bg-emerald-500/15 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider text-emerald-700 dark:text-emerald-300">
          agent
        </span>
        <span className="truncate font-medium text-foreground">{event.agentName}</span>
        {hasActions && (
          <span className="text-[10px] text-muted-foreground">
            ({actions.length} action{actions.length === 1 ? '' : 's'})
          </span>
        )}
        <span className="ml-auto flex shrink-0 items-center gap-2 text-[11px] text-muted-foreground">
          <ToolTokenBadge input={inputTokens} output={outputTokens} />
          <span>{formatTime(event.timestamp)}</span>
          {expanded ? <ChevronDownIcon className="size-3" /> : <ChevronRightIcon className="size-3" />}
        </span>
      </button>

      {expanded && (
        <div className="space-y-2 border-t border-emerald-500/15 px-3 py-2 dark:border-emerald-400/15">
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
  const formatted = formatValue(value)
  return (
    <div className="group/kv relative">
      <div className="mb-1 flex items-center justify-between gap-2">
        <div className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{label}</div>
        <CopyButton value={formatted} className="opacity-0 transition-opacity group-hover/kv:opacity-100" />
      </div>
      <pre className="max-h-72 overflow-y-auto whitespace-pre-wrap break-words rounded bg-muted px-2 py-1.5 font-mono text-xs text-foreground">
        {formatted}
      </pre>
    </div>
  )
}

function formatValue(v: unknown): string {
  if (typeof v === 'string') return v
  try {
    return JSON.stringify(v, null, 2)
  } catch {
    return String(v)
  }
}
