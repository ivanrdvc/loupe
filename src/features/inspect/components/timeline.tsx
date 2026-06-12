import { ChevronDown, ChevronRight } from 'lucide-react'
import { useCallback, useMemo, useState } from 'react'
import { ScrollArea } from '#/components/ui/scroll-area'
import { type InspectorView, spanHasError } from '#/features/inspect/logic'
import type { Span } from '#/lib/spans'
import { ACCENT } from '#/lib/tone'
import { cn } from '#/lib/utils'
import { displayFor, fmtNum, formatDuration, SPAN_FAMILY } from './shared'
import { buildRows, type Row } from './tree'

// Name column · time lane; subgrid rows keep the lane edge aligned with the ruler.
const SECTION_GRID = 'grid grid-cols-[14rem_minmax(0,1fr)]'
const ROW_GRID = 'col-span-2 grid grid-cols-subgrid'
const INDENT = 14
const TICKS = [0, 0.25, 0.5, 0.75, 1]
const EMPTY_RAW_ROOTS = new Set<string>()

interface Section {
  root: Span
  rows: Row[]
  startMs: number
  endMs: number
}

// One time domain per trace root — a shared session axis would be dominated by
// idle time between turns. Extent spans the root's full raw subtree so bars
// never overflow when children outlive the root span.
function buildSections(view: InspectorView, rows: Row[]): Section[] {
  const subtreeExtent = (root: Span) => {
    let startMs = root.startMs
    let endMs = root.endMs
    const stack = [root.id]
    for (let id = stack.pop(); id != null; id = stack.pop()) {
      for (const child of view.childrenByParent.get(id) ?? []) {
        startMs = Math.min(startMs, child.startMs)
        endMs = Math.max(endMs, child.endMs)
        stack.push(child.id)
      }
    }
    return { startMs, endMs }
  }

  const sections: Section[] = []
  let current: Section | null = null
  for (const row of rows) {
    if (!current || current.root.id !== row.rootId) {
      const root = view.byId.get(row.rootId)
      if (!root) continue
      current = { root, rows: [], ...subtreeExtent(root) }
      sections.push(current)
    }
    current.rows.push(row)
  }
  return sections
}

export function TimelineView({
  view,
  selectedId,
  onSelect,
}: {
  view: InspectorView
  selectedId: string | null
  onSelect: (id: string) => void
}) {
  const [collapsedIds, setCollapsedIds] = useState(() => new Set<string>())
  const rows = useMemo(() => buildRows(view, collapsedIds, EMPTY_RAW_ROOTS), [view, collapsedIds])
  const sections = useMemo(() => buildSections(view, rows), [view, rows])

  const toggleCollapsed = useCallback((id: string) => {
    setCollapsedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }, [])

  if (sections.length === 0) {
    return (
      <div className="flex h-full items-center justify-center text-xs text-muted-foreground/70">
        No spans in this session.
      </div>
    )
  }

  return (
    <ScrollArea className="h-full">
      <div className="space-y-6 px-4 py-3">
        {sections.map((section) => (
          <TimelineSection
            key={section.root.id}
            section={section}
            agentLabels={view.agentLabels}
            selectedId={selectedId}
            onSelect={onSelect}
            onToggleCollapse={toggleCollapsed}
          />
        ))}
      </div>
    </ScrollArea>
  )
}

function TimelineSection({
  section,
  agentLabels,
  selectedId,
  onSelect,
  onToggleCollapse,
}: {
  section: Section
  agentLabels?: Map<string, string>
  selectedId: string | null
  onSelect: (id: string) => void
  onToggleCollapse: (id: string) => void
}) {
  const total = Math.max(section.endMs - section.startMs, 1)
  const rootDisplay = displayFor(section.root, agentLabels)
  return (
    <section>
      <div className="mb-1 flex items-baseline gap-2 text-xs">
        <span className="truncate font-medium">{rootDisplay.name}</span>
        <span className="tabular-nums text-muted-foreground">{formatDuration(total)}</span>
      </div>
      <div className={cn(SECTION_GRID, 'text-[10px] tabular-nums text-muted-foreground/70')}>
        <div className="relative col-start-2 h-4">
          {TICKS.map((t) => (
            <span
              key={t}
              className={cn(
                'absolute',
                t === 1 ? 'right-0 border-border border-r pr-1' : 'border-border border-l pl-1',
              )}
              style={t === 1 ? undefined : { left: `${t * 100}%` }}
            >
              {t === 0 ? '0' : formatDuration(total * t)}
            </span>
          ))}
        </div>
        <ul className={cn(ROW_GRID, 'border-border/50 border-t')}>
          {section.rows.map((row) => (
            <TimelineRow
              key={row.span.id}
              row={row}
              domainStart={section.startMs}
              domainTotal={total}
              agentLabels={agentLabels}
              selected={row.span.id === selectedId}
              onSelect={onSelect}
              onToggleCollapse={onToggleCollapse}
            />
          ))}
        </ul>
      </div>
    </section>
  )
}

function TimelineRow({
  row,
  domainStart,
  domainTotal,
  agentLabels,
  selected,
  onSelect,
  onToggleCollapse,
}: {
  row: Row
  domainStart: number
  domainTotal: number
  agentLabels?: Map<string, string>
  selected: boolean
  onSelect: (id: string) => void
  onToggleCollapse: (id: string) => void
}) {
  const { span, depth, childCount, isCollapsed, subtreeTokens } = row
  const durationMs = span.endMs - span.startMs
  const leftPct = Math.min(Math.max(((span.startMs - domainStart) / domainTotal) * 100, 0), 100)
  const widthPct = Math.min((durationMs / domainTotal) * 100, 100 - leftPct)
  const errored = spanHasError(span)
  const display = displayFor(span, agentLabels)
  const HandleIcon = isCollapsed ? ChevronRight : ChevronDown
  const isChat = span.operation === 'chat'
  const metrics = [
    formatDuration(durationMs),
    isChat && span.inputTokens != null ? `↑${fmtNum(span.inputTokens)} ↓${fmtNum(span.outputTokens)}` : null,
    isCollapsed && subtreeTokens > 0 ? `∑ ${fmtNum(subtreeTokens)} tok` : null,
  ]
    .filter(Boolean)
    .join(' · ')
  // after the bar → before it near the right edge → inside when neither side has room
  const barEndPct = leftPct + widthPct
  const labelPos = barEndPct < 78 ? 'after' : leftPct > 22 ? 'before' : 'inside'
  const labelStyle =
    labelPos === 'after'
      ? { left: `calc(${barEndPct}% + 6px)` }
      : labelPos === 'before'
        ? { right: `calc(${100 - leftPct}% + 6px)` }
        : { right: `calc(${100 - barEndPct}% + 6px)` }

  return (
    <li
      data-span-id={span.id}
      className={cn(
        ROW_GRID,
        'relative min-h-7 items-center text-xs',
        selected ? 'bg-accent' : errored ? 'bg-destructive/5 hover:bg-destructive/10' : 'hover:bg-muted',
      )}
    >
      {errored && <div className="absolute inset-y-0 left-0 w-0.5 bg-destructive" aria-hidden />}
      {selected && !errored && <div className="absolute inset-y-0 left-0 w-0.5 bg-violet-500" aria-hidden />}
      <div className="flex min-w-0 items-center gap-1 pr-2" style={{ paddingLeft: depth * INDENT }}>
        {childCount > 0 ? (
          <button
            type="button"
            className="shrink-0 rounded p-px text-muted-foreground hover:bg-accent focus:outline-hidden focus-visible:ring-2 focus-visible:ring-ring/80"
            aria-label={`${isCollapsed ? 'Expand' : 'Collapse'} ${display.name}`}
            aria-expanded={!isCollapsed}
            onClick={() => onToggleCollapse(span.id)}
          >
            <HandleIcon className="size-3" aria-hidden />
          </button>
        ) : (
          <span className="size-3 shrink-0" />
        )}
        <button
          type="button"
          onClick={() => onSelect(span.id)}
          className="flex min-w-0 items-center gap-1 text-left focus:outline-hidden focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring/80"
        >
          {display.tagIcon && <display.tagIcon className={cn('size-3 shrink-0', display.tagColor)} aria-hidden />}
          <span className={cn('truncate', errored && 'text-destructive')} title={display.name}>
            {display.name}
          </span>
        </button>
      </div>
      <button
        type="button"
        // Pointer-only duplicate of the name button — keep tab order at one stop per row.
        tabIndex={-1}
        onClick={() => onSelect(span.id)}
        className="relative h-7 min-w-0 overflow-hidden"
      >
        <div
          className={cn(
            'absolute top-1/2 h-3 -translate-y-1/2 rounded-sm',
            errored ? 'bg-destructive' : ACCENT[SPAN_FAMILY[span.operation] ?? 'zinc'].solid,
          )}
          style={{ left: `${leftPct}%`, width: `max(${widthPct}%, 2px)` }}
          title={`${display.name} · ${formatDuration(durationMs)}`}
        />
        {metrics && (
          <span
            className={cn(
              'absolute top-1/2 -translate-y-1/2 whitespace-nowrap tabular-nums text-[10px]',
              labelPos === 'inside' ? 'text-white' : 'text-muted-foreground',
            )}
            style={labelStyle}
          >
            {metrics}
          </span>
        )}
      </button>
    </li>
  )
}
