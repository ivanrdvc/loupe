import { FlashIcon, Message01Icon, Robot01Icon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon, type IconSvgElement } from '@hugeicons/react'
import { Link } from '@tanstack/react-router'
import { useMemo } from 'react'
import { RelativeTime } from '#/components/relative-time'
import { formatDuration, shortId } from '#/lib/format'
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
      <StatusLine row={row} cadence={cadence} />
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
  const runLabel = `${row.fires.toLocaleString()} ${row.fires === 1 ? 'fire' : 'fires'}`
  const runHint = computeRunHint(row)
  const fireTone = row.errored > 0 ? 'text-rose-500 dark:text-rose-400' : 'text-emerald-500 dark:text-emerald-400'
  // Animate beams only when the task is still "live" — cron keeps firing,
  // event/webhook keep listening. A one-shot that already fired is finished.
  const animate = row.kind !== 'one_shot' || row.fires === 0

  return (
    <div className="px-4 pt-5 pb-4 lg:px-6">
      <div className="flex items-stretch justify-center gap-0">
        {conversationId ? (
          <Link
            to="/sessions/$sessionId"
            params={{ sessionId: conversationId }}
            search={{ range: 7, view: 'conversation' }}
            className="block"
          >
            <FlowNode
              icon={Message01Icon}
              iconColor="text-blue-500 dark:text-blue-400"
              tagline="Set up by"
              label={shortId(conversationId)}
              labelTitle={conversationId}
              labelMono
              caption="origin chat"
              interactive
            />
          </Link>
        ) : (
          <FlowNode
            icon={Message01Icon}
            iconColor="text-zinc-400 dark:text-zinc-500"
            tagline="Set up by"
            label="—"
            caption="not linked"
          />
        )}
        <Beam stroke={stroke} delay={0} animate={animate} />
        <FlowNode
          icon={kindMeta.icon}
          iconColor={kindMeta.color}
          tagline="Trigger"
          label={taskLabel}
          labelTitle={taskTitle}
          labelMono={!row.name && !!row.taskId}
          caption={taskHint.text}
          captionMono={taskHint.mono}
        />
        <Beam stroke={stroke} delay={0.55} animate={animate} />
        <FlowNode
          icon={FlashIcon}
          iconColor={fireTone}
          tagline="Fires"
          label={runLabel}
          caption={runHint}
          sparkline={row.spark}
          sparkTone={fireTone}
        />
        <Beam stroke={stroke} delay={1.1} animate={animate} />
        <FlowNode
          icon={Robot01Icon}
          iconColor="text-fuchsia-500 dark:text-fuchsia-400"
          tagline="Agent"
          label={row.agent ?? row.serviceName ?? 'Agent'}
          caption={row.agent && row.serviceName && row.agent !== row.serviceName ? row.serviceName : undefined}
        />
      </div>
    </div>
  )
}

function FlowNode({
  icon,
  iconColor,
  tagline,
  label,
  labelTitle,
  labelMono,
  caption,
  captionMono,
  sparkline,
  sparkTone,
  interactive,
}: {
  icon: IconSvgElement
  iconColor: string
  tagline: string
  label: string
  labelTitle?: string
  labelMono?: boolean
  caption?: React.ReactNode
  captionMono?: boolean
  sparkline?: { t: number; fires: number }[]
  sparkTone?: string
  interactive?: boolean
}) {
  return (
    <div
      className={cn(
        'group/node relative flex w-[150px] flex-col items-center gap-1.5 rounded-md border border-border bg-card px-2.5 py-2 text-center shadow-sm transition-colors',
        interactive && 'cursor-pointer hover:border-foreground/30 hover:shadow',
      )}
    >
      <span className="text-[9px] font-medium uppercase tracking-[0.08em] text-muted-foreground">{tagline}</span>
      <span className="flex size-7 items-center justify-center rounded-md bg-muted/60 ring-1 ring-inset ring-border/60">
        <HugeiconsIcon icon={icon} strokeWidth={1.6} className={cn('size-4', iconColor)} aria-hidden />
      </span>
      <span
        className={cn('block w-full truncate text-xs font-medium leading-tight', labelMono && 'font-mono text-[11px]')}
        title={labelTitle ?? label}
      >
        {label}
      </span>
      {caption && (
        <span
          className={cn(
            'block w-full truncate text-[10px] leading-tight text-muted-foreground',
            captionMono && 'font-mono text-[10px]',
          )}
          title={typeof caption === 'string' ? caption : undefined}
        >
          {caption}
        </span>
      )}
      {sparkline && sparkline.length > 0 && <SparkBars points={sparkline} tone={sparkTone ?? 'text-primary'} />}
    </div>
  )
}

function SparkBars({ points, tone }: { points: { t: number; fires: number }[]; tone: string }) {
  const max = points.reduce((m, p) => Math.max(m, p.fires), 0)
  if (max === 0) return null
  return (
    <div className="flex h-4 w-full items-end gap-px" aria-hidden>
      {points.map((p) => {
        const h = Math.max(2, Math.round((p.fires / max) * 16))
        return (
          <span
            key={p.t}
            className={cn('flex-1 rounded-sm bg-current opacity-70', tone)}
            style={{ height: `${h}px`, minWidth: '2px' }}
          />
        )
      })}
    </div>
  )
}

function Beam({ stroke, delay, animate }: { stroke: string; delay: number; animate: boolean }) {
  return (
    <div className="flex w-10 shrink-0 items-center justify-center self-center sm:w-12" aria-hidden>
      <svg viewBox="0 0 64 14" preserveAspectRatio="none" className="h-3 w-full overflow-visible">
        <title>flow</title>
        <defs>
          <marker
            id="beam-arrow"
            viewBox="0 0 10 10"
            refX="9"
            refY="5"
            markerWidth="6"
            markerHeight="6"
            orient="auto-start-reverse"
            markerUnits="userSpaceOnUse"
          >
            <path d="M0,0 L10,5 L0,10 z" fill={stroke} fillOpacity={animate ? 0.9 : 0.55} />
          </marker>
        </defs>
        <line
          x1={0}
          y1={7}
          x2={64}
          y2={7}
          stroke={stroke}
          strokeOpacity={animate ? 0.18 : 0.45}
          strokeWidth={2}
          markerEnd={animate ? undefined : 'url(#beam-arrow)'}
        />
        {animate && (
          <line
            x1={0}
            y1={7}
            x2={64}
            y2={7}
            stroke={stroke}
            strokeOpacity={0.95}
            strokeWidth={2}
            strokeDasharray="10 64"
            strokeLinecap="round"
            markerEnd="url(#beam-arrow)"
            className="motion-safe:[animation:hero-beam_2.4s_linear_infinite]"
            style={{ animationDelay: `${delay}s` }}
          />
        )}
        <style>{`@keyframes hero-beam { 0% { stroke-dashoffset: 0 } 100% { stroke-dashoffset: -74 } }`}</style>
      </svg>
    </div>
  )
}

interface Cadence {
  medianMs: number
  jitterPct: number
  label: string
}

function StatusLine({ row, cadence }: { row: TaskRow; cadence: Cadence | undefined }) {
  const { kind, fires, errored, lastFireMs, avgDurationMs } = row
  const errTone =
    errored / Math.max(fires, 1) >= 0.05
      ? 'text-rose-700 dark:text-rose-300'
      : errored > 0
        ? 'text-amber-700 dark:text-amber-300'
        : 'text-muted-foreground'
  const wrap =
    'flex flex-wrap items-baseline justify-center gap-x-4 gap-y-1 px-4 pt-3 text-[11px] tabular-nums text-muted-foreground lg:px-6'

  // Lifecycle: one-shot, single fire — past tense, no series framing.
  if (fires === 1 && kind === 'one_shot') {
    return (
      <div className={wrap}>
        <span>
          fired <RelativeTime ts={lastFireMs} />
        </span>
        <span>{formatDuration(avgDurationMs)}</span>
        <span className={errTone}>{errored === 1 ? 'errored' : 'OK'}</span>
      </div>
    )
  }

  // Cadence: cron / recurring / event / webhook / multi-fire — observed interval + last fire.
  return (
    <div className={wrap}>
      {cadence && (
        <span>
          {cadence.label}
          {cadence.jitterPct > 0 && <span className="text-muted-foreground/60"> ±{cadence.jitterPct}%</span>}
        </span>
      )}
      <span>
        last fire <RelativeTime ts={lastFireMs} />
      </span>
      <span className={errTone}>{errString(errored, fires)}</span>
    </div>
  )
}

function errString(errored: number, fires: number): string {
  if (errored === 0) return 'OK'
  if (errored === fires) return fires === 1 ? 'errored' : 'all errored'
  return `${errored} of ${fires} errored`
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

function computeTaskHint(row: TaskRow): { text: React.ReactNode; mono: boolean } {
  // One-shot already fired — kind icon + status line carry the story; no chip hint.
  if (row.kind === 'one_shot' && row.fires > 0) return { text: undefined, mono: false }
  // Event / webhook — source if known, else kind icon suffices.
  if (row.kind === 'event' || row.kind === 'webhook') {
    return row.source ? { text: row.source, mono: true } : { text: undefined, mono: false }
  }
  // Cron / unknown — schedule expression or due date.
  if (row.schedule) {
    if (looksLikeIsoDate(row.schedule)) {
      const t = Date.parse(row.schedule)
      if (!Number.isNaN(t))
        return {
          text: (
            <>
              due <RelativeTime ts={t} variant="relative" />
            </>
          ),
          mono: false,
        }
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
