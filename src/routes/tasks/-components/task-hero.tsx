import {
  Clock01Icon,
  Message01Icon,
  Notification03Icon,
  RepeatIcon,
  Robot01Icon,
  Time04Icon,
} from '@hugeicons/core-free-icons'
import { HugeiconsIcon, type IconSvgElement } from '@hugeicons/react'
import { Link } from '@tanstack/react-router'
import { useMemo } from 'react'
import { formatAgo, formatDuration } from '#/lib/format'
import type { TaskKind, TaskRow } from '#/lib/tasks/rollup'
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

const KIND_ICON: Record<TaskKind, IconSvgElement> = {
  cron: Clock01Icon,
  one_shot: Time04Icon,
  event: Notification03Icon,
  webhook: RepeatIcon,
  background: RepeatIcon,
  unknown: RepeatIcon,
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
  return (
    <div className="flex items-center justify-center gap-0 px-4 pt-5 lg:px-6">
      {conversationId ? (
        <NodeChip
          label={shortId(conversationId)}
          hint="origin chat"
          mono
          icon={Message01Icon}
          iconColor="text-blue-500 dark:text-blue-400"
          href={{
            to: '/sessions/$sessionId',
            params: { sessionId: conversationId },
            search: { range: 7, view: 'conversation' },
          }}
        />
      ) : (
        <NodeChip
          label={row.schedule ?? row.source ?? row.kind}
          hint={row.kind}
          mono={!!(row.schedule || row.source)}
          icon={KIND_ICON[row.kind]}
          iconColor="text-amber-500 dark:text-amber-400"
        />
      )}
      <Beam stroke={stroke} delay={0} />
      <NodeChip
        label={row.name ?? (row.taskId ? shortId(row.taskId) : row.kind)}
        hint={row.taskId && row.name ? shortId(row.taskId) : undefined}
        mono={!row.name && !!row.taskId}
        icon={KIND_ICON[row.kind]}
        iconColor="text-amber-500 dark:text-amber-400"
      />
      <Beam stroke={stroke} delay={0.5} />
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
  hint,
  mono,
  icon,
  iconColor,
  href,
}: {
  label: string
  hint?: string
  mono?: boolean
  icon: IconSvgElement
  iconColor: string
  href?: { to: string; params: Record<string, string>; search?: Record<string, unknown> }
}) {
  const inner = (
    <div
      className={cn(
        'flex w-[180px] flex-col items-center gap-0.5 rounded-md border border-border bg-background px-2.5 py-1.5 text-xs shadow-sm',
        href && 'transition-colors hover:border-foreground/40',
      )}
    >
      <div className="flex w-full items-center justify-center gap-1.5">
        <HugeiconsIcon icon={icon} strokeWidth={1.6} className={cn('size-3.5 shrink-0', iconColor)} aria-hidden />
        <span className={cn('min-w-0 truncate', mono && 'font-mono text-[11px]')} title={label}>
          {label}
        </span>
      </div>
      {hint && (
        <span className="block w-full truncate text-center text-[10px] text-muted-foreground" title={hint}>
          {hint}
        </span>
      )}
    </div>
  )
  if (!href) return inner
  return (
    <Link
      // biome-ignore lint/suspicious/noExplicitAny: dynamic typed route
      to={href.to as any}
      // biome-ignore lint/suspicious/noExplicitAny: ditto
      params={href.params as any}
      // biome-ignore lint/suspicious/noExplicitAny: ditto
      search={href.search as any}
      className="block"
    >
      {inner}
    </Link>
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
        {errored} of {fires} errored
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

function shortId(id: string): string {
  return id.length > 18 ? `${id.slice(0, 10)}…${id.slice(-4)}` : id
}
