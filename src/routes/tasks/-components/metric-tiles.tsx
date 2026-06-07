import type { RollupSummary } from '#/features/tasks/rollup'
import { formatPercent } from '#/lib/format'
import { cn } from '#/lib/utils'

type Tone = 'emerald' | 'amber' | 'rose' | 'muted'

const ACTIVE_CLASS: Record<Tone, string> = {
  emerald: 'bg-emerald-500 dark:bg-emerald-500',
  amber: 'bg-amber-500 dark:bg-amber-500',
  rose: 'bg-rose-500 dark:bg-rose-500',
  muted: 'bg-muted-foreground/30 dark:bg-muted-foreground/30',
}

const INACTIVE_CLASS = 'bg-muted-foreground/15 dark:bg-muted-foreground/15'

function Indicator({ tone }: { tone: Tone }) {
  const bars = tone === 'emerald' ? 3 : tone === 'amber' ? 2 : tone === 'rose' ? 1 : 0
  return (
    <div className="flex gap-0.5" aria-hidden>
      {[0, 1, 2].map((i) => (
        <div key={i} className={cn('h-3.5 w-1 rounded-sm', i < bars ? ACTIVE_CLASS[tone] : INACTIVE_CLASS)} />
      ))}
    </div>
  )
}

interface TileData {
  label: string
  value: string
  caption: string
  tone: Tone
}

function fmtCount(n: number): string {
  return n.toLocaleString()
}

function rateTone(numer: number, denom: number, greenAt: number, amberAt: number): Tone {
  if (denom === 0) return 'muted'
  const ratio = numer / denom
  if (ratio >= greenAt) return 'emerald'
  if (ratio >= amberAt) return 'amber'
  return 'rose'
}

function errorTone(errored: number, fires: number): Tone {
  if (fires === 0) return 'muted'
  if (errored === 0) return 'emerald'
  if (errored / fires < 0.05) return 'amber'
  return 'rose'
}

function buildTiles(summary: RollupSummary): TileData[] {
  return [
    {
      label: 'Success rate',
      value: formatPercent(summary.success, summary.fires),
      caption: summary.fires === 0 ? '' : `${fmtCount(summary.success)}/${fmtCount(summary.fires)}`,
      tone: rateTone(summary.success, summary.fires, 0.99, 0.95),
    },
    {
      label: 'Healthy tasks',
      value: formatPercent(summary.healthyTasks, summary.taskCount),
      caption: summary.taskCount === 0 ? '' : `${fmtCount(summary.healthyTasks)}/${fmtCount(summary.taskCount)}`,
      tone: rateTone(summary.healthyTasks, summary.taskCount, 0.95, 0.85),
    },
    {
      label: 'Errored fires',
      value: summary.fires === 0 ? '—' : fmtCount(summary.errored),
      caption: summary.fires === 0 ? '' : summary.errored === 0 ? 'clean' : `of ${fmtCount(summary.fires)} fires`,
      tone: errorTone(summary.errored, summary.fires),
    },
  ]
}

export function MetricTiles({ summary }: { summary: RollupSummary }) {
  const tiles = buildTiles(summary)
  return (
    <dl className="flex flex-wrap items-center gap-x-12 gap-y-6 border-b px-4 pb-6 lg:px-6">
      {tiles.map((t) => (
        <div key={t.label}>
          <dt className="text-sm text-muted-foreground">{t.label}</dt>
          <dd className="mt-1.5 flex items-center gap-2">
            <Indicator tone={t.tone} />
            <p className="text-lg font-semibold tabular-nums text-foreground">
              {t.value}
              {t.caption && <span className="font-medium text-muted-foreground"> — {t.caption}</span>}
            </p>
          </dd>
        </div>
      ))}
    </dl>
  )
}
