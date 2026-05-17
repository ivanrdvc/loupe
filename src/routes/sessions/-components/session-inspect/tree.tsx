import { ChevronDownIcon, ChevronRightIcon } from '@heroicons/react/16/solid'
import { useMemo, useState } from 'react'
import { asMessages, type ChatMessage, type MessagePart, type MessageRole } from '#/lib/conversation'
import { formatJson, type JsonValue } from '#/lib/json'
import { formatCost, resolveToolCalls, type Span, spanHasError, type ToolCallResolution } from '#/lib/spans'
import { displayFor, fmtNum, formatDuration } from './shared'

interface Row {
  span: Span
  depth: number
  // One entry per ancestor-rail column to the left of the row's own elbow.
  // railHasNext[i] === true ⇒ draw a full-height vertical at railX(i).
  railHasNext: boolean[]
  isLastChild: boolean
  childCount: number
  isCollapsed: boolean
  subtreeTokens: number
  subtreeCost: number
}

const INDENT = 22
const HANDLE = 16
const LEAF_DOT = 8
const TREE_LINE = 'bg-border'
// Normal completions — don't surface these on the row, they're just noise.
const NORMAL_FINISH = new Set(['stop', 'end_turn', 'complete', 'end', 'eos'])

// All rails, elbow, and indicator share this single x-axis so nothing can drift.
const railX = (depth: number) => depth * INDENT + INDENT / 2

function buildRows(spans: Span[], collapsedIds: Set<string>): Row[] {
  const byParent = new Map<string | null, Span[]>()
  for (const span of spans) {
    const siblings = byParent.get(span.parentId) ?? []
    siblings.push(span)
    byParent.set(span.parentId, siblings)
  }
  for (const siblings of byParent.values()) siblings.sort((a, b) => a.startMs - b.startMs)

  // Hide spans classified as plain http — those are the SDK-level transport
  // calls (POST /v1/chat/completions etc.). Children re-parent up so the
  // tree stays connected.
  const visibleChildren = new Map<string | null, Span[]>()
  const collect = (parentId: string | null): Span[] => {
    if (visibleChildren.has(parentId)) return visibleChildren.get(parentId) as Span[]
    const out: Span[] = []
    for (const span of byParent.get(parentId) ?? []) {
      if (span.operation === 'http') out.push(...collect(span.id))
      else out.push(span)
    }
    visibleChildren.set(parentId, out)
    return out
  }

  const aggCache = new Map<string, { tokens: number; cost: number }>()
  const agg = (span: Span): { tokens: number; cost: number } => {
    const cached = aggCache.get(span.id)
    if (cached) return cached
    let tokens = span.tokens ?? 0
    let cost = span.costUsd ?? 0
    for (const child of collect(span.id)) {
      const sub = agg(child)
      tokens += sub.tokens
      cost += sub.cost
    }
    const result = { tokens, cost }
    aggCache.set(span.id, result)
    return result
  }

  const rows: Row[] = []
  // `ancestorHasNext[i]` is "the ancestor at depth i is not the last sibling."
  // We slice(1) when constructing each row because the depth-0 entry (root's
  // own last-status) doesn't correspond to a rail column — roots have no shared rail.
  const walk = (parentId: string | null, ancestorHasNext: boolean[]) => {
    const siblings = collect(parentId)
    siblings.forEach((span, i) => {
      const isLast = i === siblings.length - 1
      const totals = agg(span)
      const children = collect(span.id)
      rows.push({
        span,
        depth: ancestorHasNext.length,
        railHasNext: ancestorHasNext.slice(1),
        isLastChild: isLast,
        childCount: children.length,
        isCollapsed: collapsedIds.has(span.id),
        subtreeTokens: totals.tokens,
        subtreeCost: totals.cost,
      })
      if (!collapsedIds.has(span.id)) walk(span.id, [...ancestorHasNext, !isLast])
    })
  }
  walk(null, [])
  return rows
}

interface SpanTreeListProps {
  spans: Span[]
  selectedId: string | null
  onSelect: (id: string) => void
}

export function SpanTreeList({ spans, selectedId, onSelect }: SpanTreeListProps) {
  const [collapsedIds, setCollapsedIds] = useState(() => new Set<string>())
  const rows = useMemo(() => buildRows(spans, collapsedIds), [spans, collapsedIds])

  const toggleCollapsed = (id: string) => {
    setCollapsedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  if (rows.length === 0) {
    return (
      <div className="flex h-full items-center justify-center px-3 text-center text-xs text-muted-foreground/70">
        No spans in this session.
      </div>
    )
  }

  return (
    <ul className="py-1">
      {rows.map((row) => (
        <SpanTreeRow
          key={row.span.id}
          row={row}
          selected={row.span.id === selectedId}
          onSelect={() => onSelect(row.span.id)}
          onToggleCollapse={() => toggleCollapsed(row.span.id)}
        />
      ))}
    </ul>
  )
}

interface SpanTreeRowProps {
  row: Row
  selected: boolean
  onSelect: () => void
  onToggleCollapse: () => void
}

function SpanTreeRow({ row, selected, onSelect, onToggleCollapse }: SpanTreeRowProps) {
  const { span, depth, railHasNext, isLastChild, childCount, isCollapsed, subtreeTokens } = row
  // Column ends right at chevron's right edge — no trailing whitespace inside the indent area.
  const indentWidth = railX(depth) + HANDLE / 2
  // All three indicator-axis decorations (below-circle vertical, handle button, leaf dot) anchor here.
  const indicatorAnchor = { left: railX(depth), top: '50%' as const }
  const display = displayFor(span)
  const durationMs = span.endMs - span.startMs
  const isAgent = span.operation === 'invoke_agent'
  const isTool = span.operation === 'tool'
  const tokenSum = (span.inputTokens ?? 0) + (span.outputTokens ?? 0)
  // Tool spans don't consume tokens themselves; hide the 0→0 noise when present.
  const showTokens = !isAgent && !(isTool && tokenSum === 0) && (span.inputTokens != null || span.outputTokens != null)
  const cached = span.cachedTokens ?? 0
  const finishReason = span.finishReasons?.[0]
  const showFinish = finishReason && !NORMAL_FINISH.has(finishReason)
  const finishCls = finishReasonClass(finishReason)
  const errored = spanHasError(span)
  const HandleIcon = isCollapsed ? ChevronRightIcon : ChevronDownIcon
  const showCount = childCount > 1

  return (
    <li>
      <div
        className={[
          'relative flex min-h-10 w-full cursor-pointer items-stretch pl-2 text-left text-xs',
          selected ? 'bg-accent' : errored ? 'bg-destructive/5 hover:bg-destructive/10' : 'hover:bg-muted',
        ].join(' ')}
      >
        <div className="relative shrink-0" style={{ width: indentWidth }} aria-hidden>
          {railHasNext.map((hasNext, i) =>
            hasNext ? (
              <div
                // biome-ignore lint/suspicious/noArrayIndexKey: rail index equals column depth, fixed for a given span
                key={`${span.id}-rail-${i}`}
                className={`absolute inset-y-0 w-px ${TREE_LINE}`}
                style={{ left: railX(i) }}
              />
            ) : null,
          )}
          {depth > 0 && (
            <>
              <div
                className={`absolute w-px ${TREE_LINE}`}
                style={{ left: railX(depth - 1), top: 0, bottom: isLastChild ? '50%' : 0 }}
              />
              <div
                className={`absolute h-px ${TREE_LINE}`}
                style={{ left: railX(depth - 1), top: '50%', width: INDENT }}
              />
            </>
          )}
          {childCount > 0 && !isCollapsed && (
            <div className={`absolute w-px ${TREE_LINE}`} style={{ ...indicatorAnchor, bottom: 0 }} />
          )}
          {childCount > 0 ? (
            <button
              type="button"
              onClick={(event) => {
                event.stopPropagation()
                onToggleCollapse()
              }}
              aria-label={`${isCollapsed ? 'Expand' : 'Collapse'} ${display.name}`}
              title={isCollapsed ? 'Expand children' : 'Collapse children'}
              className={[
                'group absolute flex items-center justify-center rounded-full text-[10px] font-semibold ring-1 ring-inset transition-colors -translate-x-1/2 -translate-y-1/2 focus:outline-hidden focus-visible:ring-2 focus-visible:ring-ring/80',
                isCollapsed
                  ? 'bg-foreground text-background ring-foreground'
                  : 'bg-muted text-muted-foreground ring-border hover:bg-accent',
              ].join(' ')}
              style={{ ...indicatorAnchor, width: HANDLE, height: HANDLE }}
            >
              {showCount && <span className="group-hover:hidden group-focus-visible:hidden">{childCount}</span>}
              <HandleIcon
                className={showCount ? 'hidden size-3 group-hover:block group-focus-visible:block' : 'size-3'}
              />
            </button>
          ) : (
            <div
              className={`absolute -translate-x-1/2 -translate-y-1/2 rounded-full ${TREE_LINE}`}
              style={{ ...indicatorAnchor, width: LEAF_DOT, height: LEAF_DOT }}
            />
          )}
        </div>

        <button
          type="button"
          onClick={onSelect}
          className="flex min-w-0 flex-1 flex-col justify-center gap-0.5 py-1.5 pr-2 pl-1 text-left leading-tight focus:outline-hidden focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring/80"
        >
          <div className="flex min-w-0 items-center gap-2">
            {display.tagLabel && (
              <span className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] font-medium ${display.tagCls}`}>
                {display.tagLabel}
              </span>
            )}
            <span className="truncate font-medium text-foreground">{display.name}</span>
            {errored && (
              <span className="shrink-0 rounded bg-destructive/10 px-1.5 py-0.5 text-[10px] font-medium text-destructive">
                error
              </span>
            )}
          </div>
          {!isAgent && (
            <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 tabular-nums text-[11px] text-muted-foreground">
              <span>{formatDuration(durationMs)}</span>
              {showTokens && (
                <span>
                  {fmtNum(span.inputTokens)} → {fmtNum(span.outputTokens)}
                  {cached > 0 && <span className="text-success"> · {fmtNum(cached)} cached</span>}
                </span>
              )}
              {subtreeTokens > 0 && !showTokens && (
                <span>
                  <span className="text-muted-foreground/70">∑</span> {fmtNum(subtreeTokens)} tok
                </span>
              )}
              {showFinish && <span className={finishCls}>{finishReason}</span>}
            </div>
          )}
        </button>
      </div>
    </li>
  )
}

export function DetailPanel({ span, spans }: { span: Span; spans?: Span[] }) {
  const duration = span.endMs - span.startMs
  const cost = formatCost(span.costUsd ?? 0)
  const display = displayFor(span)

  return (
    <div className="flex min-w-0 max-w-full flex-col gap-4 px-4 py-4">
      <div className="flex min-w-0 items-center gap-2">
        {display.tagLabel && (
          <span className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] font-medium ${display.tagCls}`}>
            {display.tagLabel}
          </span>
        )}
        <span className="truncate text-sm font-semibold text-foreground">{display.name}</span>
      </div>

      <dl className="grid min-w-0 grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-1 text-xs">
        <Stat label="Duration" value={formatDuration(duration)} />
        {span.ttftMs != null && <Stat label="TTFT" value={formatDuration(span.ttftMs)} />}
        {span.inputTokens != null && <Stat label="Input" value={fmtNum(span.inputTokens)} />}
        {span.outputTokens != null && <Stat label="Output" value={fmtNum(span.outputTokens)} />}
        {span.cachedTokens != null && span.cachedTokens > 0 && (
          <Stat label="Cached" value={fmtNum(span.cachedTokens)} />
        )}
        {span.reasoningTokens != null && span.reasoningTokens > 0 && (
          <Stat label="Reasoning" value={fmtNum(span.reasoningTokens)} />
        )}
        {span.tokens != null && <Stat label="Tokens" value={fmtNum(span.tokens)} />}
        {cost && <Stat label="Cost" value={`$${cost}`} />}
        {span.model && <Stat label="Model" value={span.model} />}
        {span.provider && <Stat label="Provider" value={span.provider} />}
        {span.finishReasons && span.finishReasons.length > 0 && (
          <Stat label="Finish" value={span.finishReasons.join(', ')} />
        )}
      </dl>

      {span.agentDescription && <RoleBlock content={span.agentDescription} />}

      {span.inputParams && <JsonBlock label="Input" raw={span.inputParams} />}
      {span.toolResult != null && <JsonBlock label="Result" value={span.toolResult} />}
      {(span.llmInput != null || span.llmOutput != null) && (
        <MessagesBlock input={span.llmInput} output={span.llmOutput} spans={spans} />
      )}

      {(span.responseId || span.systemFingerprint) && (
        <details className="rounded-lg ring-1 ring-border">
          <summary className="cursor-pointer px-3 py-2 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
            Debug
          </summary>
          <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-1 border-border border-t px-3 py-2 text-[11px]">
            {span.responseId && <Stat label="Response id" value={span.responseId} />}
            {span.systemFingerprint && <Stat label="Fingerprint" value={span.systemFingerprint} />}
          </dl>
        </details>
      )}
    </div>
  )
}

function MessagesBlock({ input, output, spans }: { input?: JsonValue; output?: JsonValue; spans?: Span[] }) {
  const inputMsgs = asMessages(input)
  const outputMsgs = asMessages(output)
  // Tool results live on the sibling execute_tool span — asMessages drops
  // tool-role messages — so we splice them back in keyed by tool_call id.
  const callResolutions = useMemo(() => (spans ? resolveToolCalls(spans) : new Map()), [spans])

  // If parser produced nothing usable, fall back to raw JSON so we don't hide data.
  if (inputMsgs.length === 0 && outputMsgs.length === 0) {
    return (
      <>
        {input != null && <JsonBlock label="LLM Input" value={input} />}
        {output != null && <JsonBlock label="LLM Output" value={output} />}
      </>
    )
  }
  return (
    <section className="flex flex-col gap-2">
      <div className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Messages</div>
      <div className="space-y-2">
        {inputMsgs.map((msg, i) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: message positions are stable for a frozen span
          <MessageCard key={`in-${i}`} msg={msg} callResolutions={callResolutions} />
        ))}
        {outputMsgs.map((msg, i) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: message positions are stable for a frozen span
          <MessageCard key={`out-${i}`} msg={msg} response callResolutions={callResolutions} />
        ))}
      </div>
    </section>
  )
}

const ROLE_STYLES: Record<MessageRole, { label: string; ring: string }> = {
  system: { label: 'System', ring: 'ring-border' },
  user: { label: 'User', ring: 'ring-border' },
  assistant: { label: 'Assistant', ring: 'ring-violet-500/30 dark:ring-violet-400/25' },
}

const TOOL_CALL_TONES = {
  agent: {
    card: 'rounded-md bg-emerald-500/5 px-2 py-1.5 ring-1 ring-emerald-500/25 dark:bg-emerald-500/10 dark:ring-emerald-400/25',
    badge: 'rounded bg-emerald-500/15 px-1.5 py-0.5 text-[10px] font-medium text-emerald-700 dark:text-emerald-300',
    label: 'sub_agent',
  },
  tool: {
    card: 'rounded-md bg-sky-500/5 px-2 py-1.5 ring-1 ring-sky-500/20 dark:bg-sky-500/10 dark:ring-sky-400/20',
    badge: 'rounded bg-sky-500/15 px-1.5 py-0.5 text-[10px] font-medium text-sky-700 dark:text-sky-300',
    label: 'tool_call',
  },
} as const

function MessageCard({
  msg,
  response,
  callResolutions,
}: {
  msg: ChatMessage
  response?: boolean
  callResolutions: Map<string, ToolCallResolution>
}) {
  const style = ROLE_STYLES[msg.role]
  return (
    <div className={`min-w-0 rounded-md bg-card px-3 py-2 ring-1 ${style.ring}`}>
      <div className="mb-1.5 flex items-center gap-2 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
        <span>{style.label}</span>
        {response && <span className="text-muted-foreground/70">· response</span>}
      </div>
      <div className="space-y-2">
        {msg.parts.map((part, i) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: part positions are stable for a frozen message
          <MessagePartView key={i} part={part} callResolutions={callResolutions} />
        ))}
      </div>
    </div>
  )
}

function MessagePartView({
  part,
  callResolutions,
}: {
  part: MessagePart
  callResolutions: Map<string, ToolCallResolution>
}) {
  if (part.kind === 'text') {
    return (
      <pre className="whitespace-pre-wrap break-words text-[11px] leading-relaxed text-foreground">{part.content}</pre>
    )
  }
  if (part.kind === 'tool_call') {
    const resolved = callResolutions.get(part.id)
    const subAgent = resolved?.subAgent
    const subAgentName = subAgent?.agentName ?? subAgent?.name
    const tone = TOOL_CALL_TONES[subAgent ? 'agent' : 'tool']
    const hasResult = resolved?.result !== undefined
    const errored = resolved && !resolved.success
    return (
      <div className={tone.card}>
        <div className="flex items-center gap-2 text-[11px]">
          <span className={tone.badge}>{tone.label}</span>
          <span className="font-mono text-foreground">{part.name}</span>
          {subAgent && subAgentName && subAgentName !== part.name && (
            <span className="text-muted-foreground">→ {subAgentName}</span>
          )}
          {errored && (
            <span className="rounded bg-destructive/10 px-1.5 py-0.5 text-[10px] font-medium text-destructive">
              error
            </span>
          )}
          <span className="ml-auto truncate font-mono text-[10px] text-muted-foreground" title={part.id}>
            {part.id}
          </span>
        </div>
        {part.arguments != null && (
          <pre className="mt-1.5 max-h-60 overflow-auto whitespace-pre-wrap break-words text-[11px] leading-snug text-foreground">
            {formatJson(part.arguments)}
          </pre>
        )}
        {hasResult && (
          <div className="mt-1.5 border-border border-t pt-1.5">
            <div className="mb-1 text-[10px] uppercase tracking-wide text-muted-foreground">Result</div>
            <pre className="max-h-60 overflow-auto whitespace-pre-wrap break-words text-[11px] leading-snug text-foreground">
              {formatJson(resolved.result)}
            </pre>
          </div>
        )}
      </div>
    )
  }
  return (
    <pre className="whitespace-pre-wrap break-words text-[11px] leading-snug text-foreground">
      {formatJson(part.response)}
    </pre>
  )
}

function RoleBlock({ content }: { content: string }) {
  return (
    <details open className="rounded-lg bg-muted ring-1 ring-border">
      <summary className="cursor-pointer px-3 py-2 text-xs font-medium text-foreground">Role</summary>
      <pre className="max-h-[28rem] overflow-auto whitespace-pre-wrap break-words border-border border-t px-3 py-2 text-[11px] leading-relaxed text-foreground">
        {content}
      </pre>
    </details>
  )
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <>
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="min-w-0 break-words tabular-nums text-foreground">{value}</dd>
    </>
  )
}

function finishReasonClass(reason: string | undefined): string {
  if (!reason) return ''
  if (reason === 'tool_calls' || reason === 'tool_use') return 'text-sky-700 dark:text-sky-300'
  if (reason === 'length' || reason === 'max_tokens') return 'text-warning'
  if (reason === 'content_filter' || reason === 'error') return 'text-destructive'
  return 'text-muted-foreground'
}

function JsonBlock({ label, value, raw }: { label: string; value?: unknown; raw?: string }) {
  const text =
    raw ??
    (() => {
      try {
        return JSON.stringify(value, null, 2)
      } catch {
        return String(value)
      }
    })()
  return (
    <div className="min-w-0 max-w-full">
      <div className="mb-1 text-[10px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <pre className="max-h-96 max-w-full overflow-auto whitespace-pre-wrap break-words rounded-md bg-muted p-2 text-[11px] leading-snug text-foreground ring-1 ring-border">
        {text}
      </pre>
    </div>
  )
}
