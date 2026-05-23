import { FlashIcon, Message01Icon, Robot01Icon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon, type IconSvgElement } from '@hugeicons/react'
import { Link } from '@tanstack/react-router'
import { useMemo } from 'react'
import { formatAgo, formatDuration, formatRelative, shortId } from '#/lib/format'
import { KIND_META } from '#/lib/tasks/kind-meta'
import type { TaskRow } from '#/lib/tasks/rollup'
import type { TraceSummary } from '#/lib/telemetry'
import { cn } from '#/lib/utils'
import { FireTimeline } from './fire-timeline'

interface TaskHeroProps {
  row: TaskRow
  fires: TraceSummary[]
  fromMs: number
  toMs: number
  conversationId?: string
  onFireClick?: (fire: TraceSummary) => void
}

export function TaskHero({ row, fires, fromMs, toMs, conversationId, onFireClick }: TaskHeroProps) {
  const errorRate = 1 - row.successRate
  const cadence = useMemo(() => deriveCadence(fires), [fires])
  const expectedMarkers = useMemo(
    () => buildExpectedMarkers(fires, cadence?.medianMs, toMs),
    [fires, cadence?.medianMs, toMs],
  )

  return (
    <div className="border-b">
      <FlowChain row={row} conversationId={conversationId} errorRate={errorRate} />
      <CadenceLine cadence={cadence} lastFireMs={row.lastFireMs} errored={row.errored} fires={row.fires} />
      <FireTimeline
        fires={fires}
        fromMs={fromMs}
        toMs={toMs}
        errorRate={errorRate}
        expectedMarkers={expectedMarkers}
        onFireClick={onFireClick}
      />
    </div>
  )
}

function FlowChain({ row, conversationId, errorRate }: { row: TaskRow; conversationId?: string; errorRate: number }) {
  const stroke = errorRate >= 0.05 ? 'var(--destructive)' : 'var(--primary)'
  const kindMeta = KIND_META[row.kind]
  const taskLabel = row.name ?? (row.taskId && shortId(row.taskId)) ?? row.rootOperation ?? kindMeta.label
  const taskTitle = row.taskId ?? row.name ?? row.rootOperation ?? kindMeta.label
  const taskHint = computeTaskHint(row)
  const runLabel = `${row.fires.toLocaleString()} ${row.fires === 1 ? 'run' : 'runs'}`
  const runHint = computeRunHint(row)
  return (
    <div className="flex items-center justify-center gap-0 px-4 pt-5 lg:px-6">
      {conversationId && (
        <>
          <Link
            to="/sessions/$sessionId"
            params={{ sessionId: conversationId }}
            search={{ range: 7, view: 'conversation' }}
            className="block"
          >
            <NodeChip
              label={shortId(conversationId)}
              title={conversationId}
              hint="origin chat"
              mono
              icon={Message01Icon}
              iconColor="text-blue-500 dark:text-blue-400"
              interactive
            />
          </Link>
          <Beam stroke={stroke} delay={0} />
        </>
      )}
      <NodeChip
        label={taskLabel}
        title={taskTitle}
        hint={taskHint.text}
        mono={!row.name && !!row.taskId}
        hintMono={taskHint.mono}
        icon={kindMeta.icon}
        iconColor={kindMeta.color}
      />
      <Beam stroke={stroke} delay={0.5} />
      <NodeChip
        label={runLabel}
        hint={runHint}
        icon={FlashIcon}
        iconColor={row.errored > 0 ? 'text-rose-500 dark:text-rose-400' : 'text-emerald-500 dark:text-emerald-400'}
      />
      <Beam stroke={stroke} delay={1} />
      <NodeChip
        label={row.agent ?? row.serviceName ?? 'Agent'}
        hint={row.agent && row.serviceName && row.agent !== row.serviceName ? row.serviceName : undefined}
        icon={Robot01Icon}
        iconColor="text-fuchsia-500 dark:text-fuchsia-400"
      />
    </div>
  )
}

function NodeChip({
  label,
  title,
  hint,
  mono,
  hintMono,
  icon,
  iconColor,
  interactive,
}: {
  label: string
  title?: string
  hint?: string
  mono?: boolean
  hintMono?: boolean
  icon: IconSvgElement
  iconColor: string
  interactive?: boolean
}) {
  return (
    <div
      className={cn(
        'flex w-[160px] flex-col items-center gap-0.5 rounded-md border border-border bg-background px-2.5 py-1.5 text-xs shadow-sm',
        interactive && 'transition-colors hover:border-foreground/40',
      )}
    >
      <div className="flex w-full items-center justify-center gap-1.5">
        <HugeiconsIcon icon={icon} strokeWidth={1.6} className={cn('size-3.5 shrink-0', iconColor)} aria-hidden />
        <span className={cn('min-w-0 truncate', mono && 'font-mono text-[11px]')} title={title ?? label}>
          {label}
        </span>
      </div>
      {hint && (
        <span
          className={cn('block w-full truncate text-center text-[10px] text-muted-foreground', hintMono && 'font-mono')}
          title={hint}
        >
          {hint}
        </span>
      )}
    </div>
  )
}

function Beam({ stroke, delay }: { stroke: string; delay: number }) {
  return (
    <svg viewBox="0 0 60 12" preserveAspectRatio="none" className="h-3 w-12 shrink-0" aria-hidden>
      <title>flow</title>
      <line x1={0} y1={6} x2={60} y2={6} stroke={stroke} strokeOpacity={0.2} strokeWidth={2} />
      <line
        x1={0}
        y1={6}
        x2={60}
        y2={6}
        stroke={stroke}
        strokeOpacity={0.95}
        strokeWidth={2}
        strokeDasharray="8 60"
        strokeLinecap="round"
        className="motion-safe:[animation:hero-beam_2.2s_linear_infinite]"
        style={{ animationDelay: `${delay}s` }}
      />
      <style>{`@keyframes hero-beam { 0% { stroke-dashoffset: 0 } 100% { stroke-dashoffset: -68 } }`}</style>
    </svg>
  )
}

interface Cadence {
  medianMs: number
  jitterPct: number
  label: string
}

function CadenceLine({
  cadence,
  lastFireMs,
  errored,
  fires,
}: {
  cadence: Cadence | undefined
  lastFireMs: number
  errored: number
  fires: number
}) {
  const errTone =
    errored / Math.max(fires, 1) >= 0.05
      ? 'text-rose-700 dark:text-rose-300'
      : errored > 0
        ? 'text-amber-700 dark:text-amber-300'
        : 'text-muted-foreground'
  return (
    <div className="flex flex-wrap items-baseline justify-center gap-x-4 gap-y-1 px-4 pt-3 text-[11px] tabular-nums text-muted-foreground lg:px-6">
      {cadence && (
        <span>
          {cadence.label}
          {cadence.jitterPct > 0 && <span className="text-muted-foreground/60"> ±{cadence.jitterPct}%</span>}
        </span>
      )}
      <span>last fire {formatAgo(lastFireMs)}</span>
      <span className={errTone}>
        {fires === 1 ? (errored === 1 ? 'errored' : 'OK') : `${errored} of ${fires} errored`}
      </span>
    </div>
  )
}

function deriveCadence(fires: TraceSummary[]): Cadence | undefined {
  if (fires.length < 2) return undefined
  const sorted = [...fires].sort((a, b) => a.startedAtMs - b.startedAtMs)
  const intervals: number[] = []
  for (let i = 1; i < sorted.length; i++) {
    const a = sorted[i - 1]
    const b = sorted[i]
    if (a && b) intervals.push(b.startedAtMs - a.startedAtMs)
  }
  if (intervals.length === 0) return undefined
  intervals.sort((a, b) => a - b)
  const median = intervals[Math.floor(intervals.length / 2)] ?? 0
  if (median === 0) return undefined
  // Coefficient of variation — how regular the schedule is.
  const mean = intervals.reduce((s, v) => s + v, 0) / intervals.length
  const variance = intervals.reduce((s, v) => s + (v - mean) ** 2, 0) / intervals.length
  const std = Math.sqrt(variance)
  const jitterPct = mean > 0 ? Math.round((std / mean) * 100) : 0
  return {
    medianMs: median,
    jitterPct: Math.min(jitterPct, 999),
    label: `every ~${formatDuration(median)}`,
  }
}

function buildExpectedMarkers(fires: TraceSummary[], medianMs: number | undefined, toMs: number): number[] {
  // Only paint expected-next markers when the cadence looks regular — otherwise
  // it's just noise. Anchor on the most recent fire and project forward.
  if (!medianMs || fires.length < 3) return []
  const lastFireMs = fires.reduce((m, t) => Math.max(m, t.startedAtMs), 0)
  if (lastFireMs >= toMs) return []
  const markers: number[] = []
  let next = lastFireMs + medianMs
  let guard = 0
  while (next <= toMs && guard < 24) {
    markers.push(next)
    next += medianMs
    guard++
  }
  return markers
}

function computeTaskHint(row: TaskRow): { text: string | undefined; mono: boolean } {
  if (row.schedule) {
    if (looksLikeIsoDate(row.schedule)) {
      const t = Date.parse(row.schedule)
      if (!Number.isNaN(t)) return { text: `due ${formatRelative(t)}`, mono: false }
    }
    return { text: row.schedule, mono: true }
  }
  if (row.source) return { text: row.source, mono: true }
  if (row.taskId && row.name) return { text: shortId(row.taskId), mono: true }
  return { text: undefined, mono: false }
}

// Prefilter — Date.parse alone happily parses bare words like "Mon".
function looksLikeIsoDate(s: string): boolean {
  return /^\d{4}-\d{2}-\d{2}([T ]|$)/.test(s)
}

function computeRunHint(row: TaskRow): string | undefined {
  if (row.fires === 0) return undefined
  const dur = formatDuration(row.avgDurationMs)
  if (row.errored > 0) {
    return row.fires === 1 ? `errored · ${dur}` : `${row.errored} errored · avg ${dur}`
  }
  return row.fires === 1 ? dur : `avg ${dur}`
}
