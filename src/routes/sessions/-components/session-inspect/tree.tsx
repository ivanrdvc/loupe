import { ChevronDownIcon, ChevronRightIcon } from '@heroicons/react/16/solid'
import { Clock01Icon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { Badge } from '#/components/ui/badge'
import { buildAgentLabels, type Span, spanHasError } from '#/lib/spans'
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
  isParallel: boolean
}

const INDENT = 22
const HANDLE = 16
const LEAF_DOT = 8
const TREE_LINE = 'bg-border'
// Normal completions — don't surface these on the row, they're just noise.
const NORMAL_FINISH = new Set(['stop', 'end_turn', 'complete', 'end', 'eos'])

// All rails, elbow, and indicator share this single x-axis so nothing can drift.
const railX = (depth: number) => depth * INDENT + INDENT / 2

function buildRows(spans: Span[], collapsedIds: Set<string>, fullSpans: boolean): Row[] {
  const byParent = new Map<string | null, Span[]>()
  for (const span of spans) {
    const siblings = byParent.get(span.parentId) ?? []
    siblings.push(span)
    byParent.set(span.parentId, siblings)
  }
  for (const siblings of byParent.values()) siblings.sort((a, b) => a.startMs - b.startMs)

  // Hide spans classified as plain http — those are the SDK-level transport
  // calls (POST /v1/chat/completions etc.). Children re-parent up so the
  // tree stays connected. In full mode, render them as real nodes.
  const visibleChildren = new Map<string | null, Span[]>()
  const collect = (parentId: string | null): Span[] => {
    if (visibleChildren.has(parentId)) return visibleChildren.get(parentId) as Span[]
    const out: Span[] = []
    for (const span of byParent.get(parentId) ?? []) {
      if (!fullSpans && (span.operation === 'http' || span.operation === 'mcp')) out.push(...collect(span.id))
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
    // Detect parallel execution: tool siblings that started at approximately
    // the same time (dispatched concurrently by the framework). Only tool spans
    // can be parallel — LLM calls are always sequential in an agent loop.
    const parallelIds = new Set<string>()
    const toolSiblings = siblings.filter((s) => s.operation === 'tool' || s.operation === 'mcp')
    for (let i = 0; i < toolSiblings.length; i++) {
      for (let j = i + 1; j < toolSiblings.length; j++) {
        const gap = Math.abs(toolSiblings[j].startMs - toolSiblings[i].startMs)
        const longer = Math.max(
          toolSiblings[i].endMs - toolSiblings[i].startMs,
          toolSiblings[j].endMs - toolSiblings[j].startMs,
        )
        // Parallel = started within 10% of the longer tool's duration (generous),
        // with an absolute max of 500ms for very long tools.
        const threshold = Math.min(Math.max(100, longer * 0.1), 500)
        if (gap < threshold) {
          parallelIds.add(toolSiblings[i].id)
          parallelIds.add(toolSiblings[j].id)
        }
      }
    }
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
        isParallel: parallelIds.has(span.id),
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
  fullSpans?: boolean
}

export function SpanTreeList({ spans, selectedId, onSelect, fullSpans = false }: SpanTreeListProps) {
  const [collapsedIds, setCollapsedIds] = useState(() => new Set<string>())
  const rows = useMemo(() => buildRows(spans, collapsedIds, fullSpans), [spans, collapsedIds, fullSpans])
  const agentLabels = useMemo(() => buildAgentLabels(spans), [spans])

  const toggleCollapsed = (id: string) => {
    setCollapsedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  // When selection changes (e.g. from the command palette or URL), expand any
  // collapsed ancestors and scroll the row into view.
  const lastRevealedRef = useRef<string | null>(null)
  useEffect(() => {
    if (!selectedId || selectedId === lastRevealedRef.current) return
    const byId = new Map(spans.map((s) => [s.id, s]))
    const target = byId.get(selectedId)
    if (!target) return
    lastRevealedRef.current = selectedId

    const ancestorIds: string[] = []
    for (let pid = target.parentId; pid; pid = byId.get(pid)?.parentId ?? null) {
      ancestorIds.push(pid)
    }
    setCollapsedIds((prev) => {
      if (!ancestorIds.some((id) => prev.has(id))) return prev
      const next = new Set(prev)
      for (const id of ancestorIds) next.delete(id)
      return next
    })
    requestAnimationFrame(() => {
      document.querySelector(`[data-span-id="${selectedId}"]`)?.scrollIntoView({ block: 'center' })
    })
  }, [selectedId, spans])

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
          agentLabels={agentLabels}
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
  agentLabels?: Map<string, string>
}

function SpanTreeRow({ row, selected, onSelect, onToggleCollapse, agentLabels }: SpanTreeRowProps) {
  const { span, depth, railHasNext, isLastChild, childCount, isCollapsed, subtreeTokens, isParallel } = row
  // Column ends right at chevron's right edge — no trailing whitespace inside the indent area.
  const indentWidth = railX(depth) + HANDLE / 2
  // All three indicator-axis decorations (below-circle vertical, handle button, leaf dot) anchor here.
  const indicatorAnchor = { left: railX(depth), top: '50%' as const }
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
  const display = displayFor(span, agentLabels)

  return (
    <li data-span-id={span.id}>
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
                style={{
                  left: railX(depth - 1),
                  top: 0,
                  bottom: isLastChild ? '50%' : 0,
                }}
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
          className="flex min-w-0 flex-1 flex-col justify-center gap-0.5 py-1 pr-2 pl-1 text-left leading-tight focus:outline-hidden focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring/80"
        >
          <div className="flex min-w-0 items-center gap-2">
            {display.tagLabel && (
              <Badge variant="outline" className="px-1.5 text-muted-foreground">
                {display.tagIcon && (
                  <HugeiconsIcon
                    icon={display.tagIcon}
                    strokeWidth={1.5}
                    className={`size-3 ${display.tagColor ?? ''}`}
                    aria-hidden
                  />
                )}
                {display.tagLabel}
              </Badge>
            )}
            <span className="truncate font-medium text-foreground">{display.name}</span>
            {display.purposeLabel && (
              <span className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] font-medium ${display.purposeCls}`}>
                {display.purposeLabel}
              </span>
            )}
            {errored && (
              <span className="shrink-0 rounded bg-destructive/10 px-1.5 py-0.5 text-[10px] font-medium text-destructive">
                error
              </span>
            )}
            {isParallel && (
              <span className="shrink-0 rounded bg-indigo-500/10 px-1.5 py-0.5 text-[10px] font-medium text-indigo-600 dark:text-indigo-400">
                ⫽ parallel
              </span>
            )}
            {depth === 0 &&
              (span.rawAttributes?.session_trigger_type ?? span.rawAttributes?.['session.trigger_type']) ===
                'scheduled' && (
                <Badge variant="outline" className="px-1.5 text-muted-foreground">
                  <HugeiconsIcon
                    icon={Clock01Icon}
                    strokeWidth={1.5}
                    className="size-3 text-amber-500 dark:text-amber-400"
                    aria-hidden
                  />
                  Scheduled
                </Badge>
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

function finishReasonClass(reason: string | undefined): string {
  if (!reason) return ''
  if (reason === 'tool_calls' || reason === 'tool_use') return 'text-sky-700 dark:text-sky-300'
  if (reason === 'length' || reason === 'max_tokens') return 'text-warning'
  if (reason === 'content_filter' || reason === 'error') return 'text-destructive'
  return 'text-muted-foreground'
}
