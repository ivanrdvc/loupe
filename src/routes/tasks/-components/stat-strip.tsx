import { formatDuration } from '#/lib/format'
import type { RollupSummary } from '#/lib/tasks/rollup'
import { cn } from '#/lib/utils'

export function StatStrip({ summary }: { summary: RollupSummary }) {
  const errPct = summary.errorRate * 100
  const errTone =
    errPct >= 5
      ? 'text-rose-700 dark:text-rose-300'
      : errPct >= 1
        ? 'text-amber-700 dark:text-amber-300'
        : 'text-foreground'
  return (
    <div className="flex flex-wrap items-baseline gap-x-6 gap-y-1 border-b px-4 pb-4 text-sm tabular-nums lg:px-6">
      <span>
        <strong className="font-medium">{summary.fires.toLocaleString()}</strong>{' '}
        <span className="text-muted-foreground">fires</span>
      </span>
      <Dot />
      <span>
        <strong className={cn('font-medium', errTone)}>
          {summary.fires === 0 ? '—' : `${errPct.toFixed(errPct < 1 ? 2 : 1)}%`}
        </strong>{' '}
        <span className="text-muted-foreground">errors</span>
      </span>
      <Dot />
      <span>
        <span className="text-muted-foreground">avg </span>
        <strong className="font-medium">{summary.fires === 0 ? '—' : formatDuration(summary.avgDurationMs)}</strong>
      </span>
      <Dot />
      <span>
        <strong className="font-medium">{summary.taskCount}</strong>{' '}
        <span className="text-muted-foreground">{summary.taskCount === 1 ? 'task' : 'tasks'}</span>
      </span>
    </div>
  )
}

function Dot() {
  return (
    <span aria-hidden className="text-muted-foreground/60">
      ·
    </span>
  )
}
