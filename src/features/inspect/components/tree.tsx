import { Braces, ChevronDown, ChevronRight, Clock } from 'lucide-react'
import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Tooltip, TooltipContent, TooltipTrigger } from '#/components/ui/tooltip'
import {
  type InspectorView,
  isCollapsibleInfra,
  isNestedQueryEmbedding,
  isToolLike,
  spanHasError,
} from '#/features/inspect/logic'
import type { Span } from '#/lib/spans'
import { ACCENT } from '#/lib/tone'
import { cn } from '#/lib/utils'
import { displayFor, fmtNum, formatDuration } from './shared'

export interface Row {
  span: Span
  depth: number
  // One entry per ancestor-rail column to the left of the row's own elbow.
  // railHasNext[i] === true ⇒ draw a full-height vertical at railX(i).
  railHasNext: boolean[]
  isLastChild: boolean
  childCount: number
  isCollapsed: boolean
  subtreeTokens: number
  isParallel: boolean
  // Input token delta vs the previous chat sibling in the same parent scope.
  // Non-zero only on chat spans where context grew significantly between calls.
  ctxDelta?: number
  // Id of the depth-0 ancestor — keyed for the per-trace raw-spans toggle.
  rootId: string
}

const INDENT = 22
const HANDLE = 16
const LEAF_DOT = 7
const TREE_LINE = 'bg-border'
// Normal completions — don't surface these on the row, they're just noise.
const NORMAL_FINISH = new Set(['stop', 'end_turn', 'complete', 'end', 'eos'])

// All rails, elbow, and indicator share this single x-axis so nothing can drift.
const railX = (depth: number) => depth * INDENT + INDENT / 2

export function buildRows(view: InspectorView, collapsedIds: Set<string>, rawRoots: Set<string>): Row[] {
  // Reuse the shared parent index; freshly sort each sibling list once.
  const byParent = new Map<string | null, Span[]>()
  for (const [pid, kids] of view.childrenByParent) {
    byParent.set(
      pid,
      [...kids].sort((a, b) => a.startMs - b.startMs),
    )
  }

  // Hide spans classified as plain http — those are the SDK-level transport
  // calls (POST /v1/chat/completions etc.). Children re-parent up so the
  // tree stays connected. When raw is enabled for a trace, its subtree shows
  // them as real nodes. Cache key includes rootId so different traces with
  // different raw settings stay independent.
  const visibleChildren = new Map<string, Span[]>()
  const collect = (parentId: string | null, rootId: string | null): Span[] => {
    const key = `${parentId ?? ''}|${rootId ?? ''}`
    if (visibleChildren.has(key)) return visibleChildren.get(key) as Span[]
    const showRaw = rootId != null && rawRoots.has(rootId)
    const parent = parentId != null ? view.byId.get(parentId) : undefined
    const out: Span[] = []
    for (const span of byParent.get(parentId) ?? []) {
      if (!showRaw && (isCollapsibleInfra(span) || isNestedQueryEmbedding(span, parent)))
        out.push(...collect(span.id, rootId))
      else out.push(span)
    }
    visibleChildren.set(key, out)
    return out
  }

  // Aggregation walks the full byParent tree (not visibleChildren) so totals
  // are invariant to which traces have raw on — otherwise the same span would
  // get different tokens depending on which root it was viewed from.
  const aggCache = new Map<string, number>()
  const agg = (span: Span): number => {
    const cached = aggCache.get(span.id)
    if (cached != null) return cached
    let tokens = span.tokens ?? 0
    for (const child of byParent.get(span.id) ?? []) {
      tokens += agg(child)
    }
    aggCache.set(span.id, tokens)
    return tokens
  }

  const rows: Row[] = []
  // `ancestorHasNext[i]` is "the ancestor at depth i is not the last sibling."
  // We slice(1) when constructing each row because the depth-0 entry (root's
  // own last-status) doesn't correspond to a rail column — roots have no shared rail.
  const walk = (parentId: string | null, ancestorHasNext: boolean[], rootId: string | null) => {
    const siblings = collect(parentId, rootId)
    // Detect parallel execution: tool siblings that started at approximately
    // the same time (dispatched concurrently by the framework). Only tool spans
    // can be parallel — LLM calls are always sequential in an agent loop.
    const parallelIds = new Set<string>()
    const toolSiblings = siblings.filter(isToolLike)
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
    // Track previous chat span's input tokens to compute per-call context deltas.
    let prevChatInputTokens: number | null = null
    siblings.forEach((span, i) => {
      const isLast = i === siblings.length - 1
      const subtreeTokens = agg(span)
      const effectiveRootId = rootId ?? span.id
      const children = collect(span.id, effectiveRootId)
      const isChat = span.operation === 'chat'
      let ctxDelta: number | undefined
      if (isChat && span.inputTokens != null && prevChatInputTokens != null) {
        const delta = span.inputTokens - prevChatInputTokens
        // Only surface significant growth — small deltas are normal reply overhead.
        if (delta > 5_000) ctxDelta = delta
      }
      if (isChat && span.inputTokens != null) prevChatInputTokens = span.inputTokens
      rows.push({
        span,
        depth: ancestorHasNext.length,
        railHasNext: ancestorHasNext.slice(1),
        isLastChild: isLast,
        childCount: children.length,
        isCollapsed: collapsedIds.has(span.id),
        subtreeTokens,
        isParallel: parallelIds.has(span.id),
        ctxDelta,
        rootId: effectiveRootId,
      })
      if (!collapsedIds.has(span.id)) walk(span.id, [...ancestorHasNext, !isLast], effectiveRootId)
    })
  }
  walk(null, [], null)
  return rows
}

interface SpanTreeListProps {
  view: InspectorView
  selectedId: string | null
  onSelect: (id: string) => void
  /** Controlled per-trace raw-spans state (provide via useRawRoots). */
  rawRoots: Set<string>
  onToggleRawRoot: (id: string) => void
  /** Imperative reveal: ensures the given root id has raw on (used when the
   * selected span is an infra descendant). */
  onEnsureRawRoot: (id: string) => void
}

export function SpanTreeList({
  view,
  selectedId,
  onSelect,
  rawRoots,
  onToggleRawRoot,
  onEnsureRawRoot,
}: SpanTreeListProps) {
  const [collapsedIds, setCollapsedIds] = useState(() => new Set<string>())
  const rows = useMemo(() => {
    if (import.meta.env.DEV) {
      const t0 = performance.now()
      const out = buildRows(view, collapsedIds, rawRoots)
      const dt = performance.now() - t0
      if (dt > 5) console.debug(`[tree] buildRows: ${out.length} rows, ${dt.toFixed(1)}ms`)
      return out
    }
    return buildRows(view, collapsedIds, rawRoots)
  }, [view, collapsedIds, rawRoots])

  // Stable callbacks so memoized rows whose props are content-equal don't
  // re-render when the parent re-renders for unrelated reasons (e.g. only one
  // root's rawRoots flipped, but every row was getting fresh closures before).
  const toggleCollapsed = useCallback((id: string) => {
    setCollapsedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }, [])

  // When selection changes (e.g. from the command palette or URL), expand any
  // collapsed ancestors and scroll the row into view. If the target is an
  // infra span hidden by default, flip raw on for its root so it actually
  // appears in the tree.
  const lastRevealedRef = useRef<string | null>(null)
  useEffect(() => {
    if (!selectedId || selectedId === lastRevealedRef.current) return
    const target = view.byId.get(selectedId)
    if (!target) return
    lastRevealedRef.current = selectedId

    const ancestorIds: string[] = []
    let rootId: string = target.id
    for (let pid = target.parentId; pid; ) {
      const parent = view.byId.get(pid)
      if (!parent) break
      ancestorIds.push(pid)
      rootId = pid
      pid = parent.parentId ?? null
    }
    setCollapsedIds((prev) => {
      if (!ancestorIds.some((id) => prev.has(id))) return prev
      const next = new Set(prev)
      for (const id of ancestorIds) next.delete(id)
      return next
    })
    // Infra ancestors don't hide the target — buildRows promotes their
    // children — so only a target that is itself collapsed needs raw on.
    const targetParent = target.parentId ? view.byId.get(target.parentId) : undefined
    if (isCollapsibleInfra(target) || isNestedQueryEmbedding(target, targetParent)) onEnsureRawRoot(rootId)
    requestAnimationFrame(() => {
      document.querySelector(`[data-span-id="${selectedId}"]`)?.scrollIntoView({ block: 'nearest' })
    })
  }, [selectedId, view, onEnsureRawRoot])

  if (rows.length === 0) {
    return (
      // Absolute against the ScrollArea root: Radix's viewport content wrapper
      // has no height, so h-full centering collapses inside it.
      <div className="absolute inset-0 flex items-center justify-center px-3 text-center text-xs text-muted-foreground/70">
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
          rawOn={row.depth === 0 ? rawRoots.has(row.span.id) : false}
          agentLabels={view.agentLabels}
          onSelect={onSelect}
          onToggleCollapse={toggleCollapsed}
          onToggleRaw={onToggleRawRoot}
        />
      ))}
    </ul>
  )
}

interface SpanTreeRowProps {
  row: Row
  selected: boolean
  rawOn: boolean
  agentLabels?: Map<string, string>
  onSelect: (id: string) => void
  onToggleCollapse: (id: string) => void
  onToggleRaw: (id: string) => void
}

function rowPropsEqual(a: SpanTreeRowProps, b: SpanTreeRowProps): boolean {
  if (a.selected !== b.selected) return false
  if (a.rawOn !== b.rawOn) return false
  if (a.agentLabels !== b.agentLabels) return false
  if (a.onSelect !== b.onSelect) return false
  if (a.onToggleCollapse !== b.onToggleCollapse) return false
  if (a.onToggleRaw !== b.onToggleRaw) return false
  const ra = a.row
  const rb = b.row
  if (ra === rb) return true
  if (ra.span !== rb.span) return false
  if (
    ra.depth !== rb.depth ||
    ra.isLastChild !== rb.isLastChild ||
    ra.childCount !== rb.childCount ||
    ra.isCollapsed !== rb.isCollapsed ||
    ra.subtreeTokens !== rb.subtreeTokens ||
    ra.isParallel !== rb.isParallel ||
    ra.ctxDelta !== rb.ctxDelta ||
    ra.rootId !== rb.rootId
  )
    return false
  if (ra.railHasNext.length !== rb.railHasNext.length) return false
  for (let i = 0; i < ra.railHasNext.length; i++) {
    if (ra.railHasNext[i] !== rb.railHasNext[i]) return false
  }
  return true
}

const SpanTreeRow = memo(SpanTreeRowImpl, rowPropsEqual)

function SpanTreeRowImpl({
  row,
  selected,
  rawOn,
  agentLabels,
  onSelect,
  onToggleCollapse,
  onToggleRaw,
}: SpanTreeRowProps) {
  const { span, depth, railHasNext, isLastChild, childCount, isCollapsed, subtreeTokens, isParallel, ctxDelta } = row
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
  const HandleIcon = isCollapsed ? ChevronRight : ChevronDown
  const showCount = childCount > 1
  const display = displayFor(span, agentLabels)

  return (
    <li data-span-id={span.id}>
      <div
        className={cn(
          'group/row relative flex min-h-9 w-full cursor-pointer items-stretch pl-2 text-left text-xs',
          selected ? 'bg-accent' : errored ? 'bg-destructive/5 hover:bg-destructive/10' : 'hover:bg-muted',
        )}
      >
        {errored && <div className="absolute inset-y-0 left-0 w-0.5 bg-destructive" aria-hidden />}
        {selected && !errored && <div className="absolute inset-y-0 left-0 w-0.5 bg-violet-500" aria-hidden />}
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
                onToggleCollapse(span.id)
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
                aria-hidden
              />
            </button>
          ) : (
            <div
              className="absolute -translate-x-1/2 -translate-y-1/2 rounded-full bg-border"
              style={{ ...indicatorAnchor, width: LEAF_DOT, height: LEAF_DOT }}
            />
          )}
        </div>

        <button
          type="button"
          onClick={() => onSelect(span.id)}
          className="flex min-w-0 flex-1 flex-col justify-center gap-0.5 py-1 pr-2 pl-1 text-left leading-tight focus:outline-hidden focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring/80"
        >
          <div className="flex min-w-0 items-center gap-2">
            {display.tagLabel && (
              <span className={cn('inline-flex shrink-0 items-center gap-1 text-[11px] font-medium', display.tagColor)}>
                {display.tagIcon && <display.tagIcon className="size-3.5" aria-hidden />}
                {display.tagLabel}
              </span>
            )}
            <span className="truncate font-medium text-foreground">{display.name}</span>
            {display.purposeLabel && (
              <span className={`shrink-0 rounded px-1 py-px text-[10px] font-medium ${display.purposeCls}`}>
                {display.purposeLabel}
              </span>
            )}
            {isParallel && <span className={`shrink-0 text-[10px] font-medium ${ACCENT.cyan.text}`}>⫽ parallel</span>}
            {depth === 0 &&
              (span.rawAttributes?.session_trigger_type ?? span.rawAttributes?.['session.trigger_type']) ===
                'scheduled' && (
                <span
                  className={`inline-flex shrink-0 items-center gap-1 rounded px-1 py-px text-[10px] font-medium ${ACCENT.amber.badge}`}
                >
                  <Clock className="size-3" aria-hidden />
                  scheduled
                </span>
              )}
          </div>
          {(() => {
            // Agent rows stay clean except collapsed — then the hidden subtree's rollup must surface.
            if (isAgent && !(isCollapsed && subtreeTokens > 0)) return null
            // Tool/MCP spans usually wrap a frontend handoff with no real backend work
            // — duration is sub-millisecond and meaningless. Hide it unless the span
            // actually did something (e.g. wraps a sub-agent or real backend execution).
            const showDuration = !((isTool || span.operation === 'mcp') && durationMs < 1)
            if (!showDuration && !showTokens && !(subtreeTokens > 0) && !showFinish) return null
            return (
              <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 tabular-nums text-[11px] text-muted-foreground">
                {showDuration && <span>{formatDuration(durationMs)}</span>}
                {showTokens && (
                  <span className="inline-flex items-center gap-1.5">
                    <span>↑{fmtNum(span.inputTokens)}</span>
                    <span>↓{fmtNum(span.outputTokens)}</span>
                    {cached > 0 && <span className="text-success">· {fmtNum(cached)} cached</span>}
                    {ctxDelta != null && (
                      <span className="ml-0.5 rounded bg-warning/15 px-1 py-0.5 text-[10px] font-semibold text-warning">
                        +{fmtNum(ctxDelta)} ctx
                      </span>
                    )}
                  </span>
                )}
                {subtreeTokens > 0 && !showTokens && (
                  <span>
                    <span className="text-muted-foreground/70">∑</span> {fmtNum(subtreeTokens)} tok
                  </span>
                )}
                {showFinish && <span className={finishCls}>{finishReason}</span>}
              </div>
            )
          })()}
        </button>
        {depth === 0 && (
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                onClick={(event) => {
                  event.stopPropagation()
                  onToggleRaw(span.id)
                }}
                aria-pressed={rawOn}
                aria-label={rawOn ? 'Hide raw spans for this trace' : 'Show raw spans for this trace'}
                className={cn(
                  'mr-3 inline-flex size-6 shrink-0 self-center items-center justify-center rounded-md transition-opacity',
                  'focus:outline-hidden focus-visible:opacity-100 focus-visible:ring-2 focus-visible:ring-ring/80',
                  rawOn
                    ? 'bg-muted text-foreground opacity-100'
                    : 'text-muted-foreground opacity-0 hover:bg-muted hover:text-foreground group-hover/row:opacity-100',
                )}
              >
                <Braces className="size-3.5" aria-hidden />
              </button>
            </TooltipTrigger>
            <TooltipContent>{rawOn ? 'Hide raw spans' : 'Show raw spans'}</TooltipContent>
          </Tooltip>
        )}
      </div>
    </li>
  )
}

function finishReasonClass(reason: string | undefined): string {
  if (!reason) return ''
  if (reason === 'tool_calls' || reason === 'tool_use') return ACCENT.sky.status
  if (reason === 'length' || reason === 'max_tokens') return 'text-warning'
  if (reason === 'content_filter' || reason === 'error') return 'text-destructive'
  return 'text-muted-foreground'
}
