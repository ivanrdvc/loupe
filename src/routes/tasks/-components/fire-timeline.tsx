import { useMemo, useState } from 'react'
import { RelativeTime } from '#/components/relative-time'
import { formatAgo, formatDuration } from '#/lib/format'
import type { TraceSummary } from '#/lib/telemetry'
import { ACCENT } from '#/lib/tone'
import { cn } from '#/lib/utils'

interface FireTimelineProps {
  fires: TraceSummary[]
  fromMs: number
  toMs: number
  errorRate: number
  /** Faint dashed verticals projecting expected fire times beyond the last actual fire. Empty when cadence isn't regular. */
  expectedMarkers?: number[]
  onFireClick?: (fire: TraceSummary) => void
}

const W = 1000
const H = 80
const PAD_X = 12
const TICK_W = 2.5
const TRACK_TOP = 18
const TRACK_BOTTOM = 58
const TRACK_HEIGHT = TRACK_BOTTOM - TRACK_TOP

interface Hovered {
  fire: TraceSummary
  x: number
}

export function FireTimeline({ fires, fromMs, toMs, errorRate, expectedMarkers, onFireClick }: FireTimelineProps) {
  const [hovered, setHovered] = useState<Hovered | null>(null)
  const okStroke = errorRate >= 0.05 ? 'var(--destructive)' : 'var(--primary)'

  const sorted = useMemo(() => [...fires].sort((a, b) => a.startedAtMs - b.startedAtMs), [fires])
  const span = Math.max(1, toMs - fromMs)
  const xFor = (t: number) => PAD_X + ((t - fromMs) / span) * (W - PAD_X * 2)

  const axisTicks = useMemo(() => buildAxisTicks(fromMs, toMs), [fromMs, toMs])

  return (
    <div className="px-4 py-5 lg:px-6">
      <div className="relative mx-auto h-[80px] w-full max-w-[1000px]">
        {/* biome-ignore lint/a11y/useKeyWithClickEvents: cursor-driven hit detection, keyboard nav handled by the fires table below */}
        <svg
          viewBox={`0 0 ${W} ${H}`}
          preserveAspectRatio="none"
          className="absolute inset-0 h-full w-full"
          onMouseMove={(e) => {
            if (sorted.length === 0) return
            const rect = e.currentTarget.getBoundingClientRect()
            const xPx = ((e.clientX - rect.left) / rect.width) * W
            const tMs = fromMs + ((xPx - PAD_X) / (W - PAD_X * 2)) * span
            const nearest = nearestFire(sorted, tMs)
            if (!nearest) return
            const dx = Math.abs(xFor(nearest.startedAtMs) - xPx)
            if (dx > 12) {
              setHovered(null)
            } else {
              setHovered({ fire: nearest, x: xFor(nearest.startedAtMs) })
            }
          }}
          onMouseLeave={() => setHovered(null)}
          onClick={() => {
            if (hovered && onFireClick) onFireClick(hovered.fire)
          }}
        >
          <title>Fire timeline</title>
          {/* baseline */}
          <line
            x1={PAD_X}
            y1={(TRACK_TOP + TRACK_BOTTOM) / 2}
            x2={W - PAD_X}
            y2={(TRACK_TOP + TRACK_BOTTOM) / 2}
            stroke="var(--border)"
            strokeWidth={1}
          />
          {/* axis ticks */}
          {axisTicks.map((t) => (
            <g key={t.ms}>
              <line
                x1={xFor(t.ms)}
                x2={xFor(t.ms)}
                y1={TRACK_BOTTOM + 2}
                y2={TRACK_BOTTOM + 6}
                stroke="var(--border)"
              />
              <text
                x={xFor(t.ms)}
                y={H - 6}
                textAnchor="middle"
                className="fill-muted-foreground text-[10px] tabular-nums"
              >
                {t.label}
              </text>
            </g>
          ))}
          {/* expected next-fire markers (cron / regular cadence) */}
          {expectedMarkers?.map((ts) => {
            const x = xFor(ts)
            return (
              <line
                key={`exp-${ts}`}
                x1={x}
                x2={x}
                y1={TRACK_TOP + 2}
                y2={TRACK_BOTTOM - 2}
                stroke="var(--muted-foreground)"
                strokeWidth={1}
                strokeOpacity={0.4}
                strokeDasharray="2 3"
                className="pointer-events-none"
              />
            )
          })}
          {/* fires */}
          {sorted.map((fire) => {
            const x = xFor(fire.startedAtMs)
            const isErr = fire.hasError
            return (
              <rect
                key={fire.id}
                x={x - TICK_W / 2}
                y={TRACK_TOP}
                width={TICK_W}
                height={TRACK_HEIGHT}
                rx={1}
                fill={isErr ? 'var(--destructive)' : okStroke}
                fillOpacity={0.55}
                className="pointer-events-none"
              />
            )
          })}
          {/* hover indicator */}
          {hovered && (
            <line
              x1={hovered.x}
              x2={hovered.x}
              y1={TRACK_TOP - 4}
              y2={TRACK_BOTTOM + 4}
              stroke="var(--foreground)"
              strokeWidth={1}
              strokeOpacity={0.6}
              className="pointer-events-none"
            />
          )}
        </svg>

        {hovered && (
          <div
            className={cn(
              'pointer-events-none absolute -translate-x-1/2 rounded-md border border-border bg-popover px-2 py-1 text-[11px] shadow-sm',
              onFireClick && 'cursor-pointer',
            )}
            style={{ left: `${(hovered.x / W) * 100}%`, top: 0 }}
          >
            <div className="flex items-baseline gap-2 tabular-nums">
              <span className={hovered.fire.hasError ? ACCENT.rose.status : ''}>
                {hovered.fire.hasError ? 'error' : 'ok'}
              </span>
              <span className="text-muted-foreground">·</span>
              <span>{formatDuration(hovered.fire.durationMs)}</span>
              <span className="text-muted-foreground">·</span>
              <RelativeTime ts={hovered.fire.startedAtMs} className="text-muted-foreground" />
            </div>
          </div>
        )}
      </div>
      {sorted.length === 0 && (
        <div className="mx-auto max-w-[1000px] pt-2 text-center text-xs text-muted-foreground">
          No fires in this window.
        </div>
      )}
    </div>
  )
}

interface AxisTick {
  ms: number
  label: string
}

function buildAxisTicks(fromMs: number, toMs: number): AxisTick[] {
  // 5 evenly-spaced ticks across the window. Labels relative to "now."
  const steps = 4
  const step = (toMs - fromMs) / steps
  const ticks: AxisTick[] = []
  for (let i = 0; i <= steps; i++) {
    const t = fromMs + step * i
    ticks.push({ ms: t, label: i === steps ? 'now' : formatAgo(t) })
  }
  return ticks
}

function nearestFire(sorted: TraceSummary[], tMs: number): TraceSummary | undefined {
  if (sorted.length === 0) return undefined
  let lo = 0
  let hi = sorted.length - 1
  while (lo < hi) {
    const mid = (lo + hi) >> 1
    const m = sorted[mid]
    if (!m) break
    if (m.startedAtMs < tMs) lo = mid + 1
    else hi = mid
  }
  const at = sorted[lo]
  const prev = lo > 0 ? sorted[lo - 1] : undefined
  if (!at) return prev
  if (!prev) return at
  return Math.abs(at.startedAtMs - tMs) <= Math.abs(prev.startedAtMs - tMs) ? at : prev
}
