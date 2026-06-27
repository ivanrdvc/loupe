import { ArrowDownRight, ArrowUpRight, CircleAlert, CircleCheck, Minus, TriangleAlert } from 'lucide-react'
import { Badge } from '#/components/ui/badge'
import type { DatasetRunItem, ItemScore, RunItemStatus } from '#/features/evaluation'
import { ACCENT } from '#/lib/tone'
import { cn } from '#/lib/utils'

export function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{label}</span>
      {children}
    </div>
  )
}

export function StatusIcon({ status }: { status: RunItemStatus }) {
  if (status === 'ok') return <CircleCheck className="size-3.5 text-success" />
  if (status === 'changed') return <TriangleAlert className="size-3.5 text-warning" />
  if (status === 'error') return <CircleAlert className="size-3.5 text-destructive" />
  return <span className="inline-block size-2 rounded-full bg-muted-foreground/40" />
}

// 'changed' is still a successful execution — the answer just differs from a prior run.
export type RunStatus = 'ok' | 'error'
export function runStatus(it: DatasetRunItem): RunStatus {
  return it.status === 'error' ? 'error' : 'ok'
}

// fail if any score failed, else pass if any passed, else null (numeric-only / not judged).
export type ScoreVerdict = 'pass' | 'fail'
export function scoreVerdict(it: DatasetRunItem): ScoreVerdict | null {
  if (it.scores.some((s) => s.pass === false)) return 'fail'
  if (it.scores.some((s) => s.pass === true)) return 'pass'
  return null
}

export function StatusBadge({ it }: { it: DatasetRunItem | null }) {
  if (!it) return <span className="text-[10px] text-muted-foreground">—</span>
  const status = runStatus(it)
  if (status === 'error')
    return (
      <Badge
        variant="outline"
        title={it.errorText ?? undefined}
        className="gap-1 border-destructive/40 font-normal text-destructive"
      >
        <CircleAlert className="size-3" />
        error
      </Badge>
    )
  return (
    <Badge variant="outline" className={cn('gap-1 border-emerald-600/40 font-normal', ACCENT.emerald.status)}>
      <CircleCheck className="size-3" />
      ok
    </Badge>
  )
}

export function VerdictBadge({ it }: { it: DatasetRunItem | null }) {
  if (!it) return null
  if (it.status === 'error') return null
  const verdict = scoreVerdict(it)
  if (verdict == null) return <span className="text-[10px] text-muted-foreground">not judged</span>
  return (
    <Badge
      variant="outline"
      className={cn(
        'gap-1 font-medium uppercase',
        verdict === 'pass' && `border-emerald-600/40 ${ACCENT.emerald.status}`,
        verdict === 'fail' && 'border-destructive/40 text-destructive',
      )}
    >
      {verdict}
    </Badge>
  )
}

export function ScoreChip({ s }: { s: ItemScore }) {
  const verdict =
    s.pass === true ? 'pass' : s.pass === false ? 'fail' : (s.label ?? (s.value != null ? String(s.value) : '—'))
  return (
    <Badge
      variant="outline"
      title={s.explanation ?? undefined}
      className={cn(
        'gap-1 font-normal',
        s.pass === true && `border-emerald-600/40 ${ACCENT.emerald.status}`,
        s.pass === false && 'border-destructive/40 text-destructive',
        s.pass == null && 'text-muted-foreground',
      )}
    >
      <span className="text-muted-foreground">{s.name}</span>
      {verdict}
    </Badge>
  )
}

export function ScoreChips({ it }: { it: DatasetRunItem | null }) {
  if (!it) return null
  if (it.scores.length === 0)
    return <span className="text-[10px] text-muted-foreground">{it.status === 'error' ? '—' : 'not judged'}</span>
  return (
    <div className="flex flex-wrap items-center justify-end gap-1">
      {it.scores.map((s) => (
        <ScoreChip key={s.name} s={s} />
      ))}
    </div>
  )
}

export interface RunFilter {
  status: RunStatus | null
  score: ScoreVerdict | null
}
export const NO_FILTER: RunFilter = { status: null, score: null }

export function runFilterMatches(filter: RunFilter, it: DatasetRunItem | null): boolean {
  if (filter.status && (!it || runStatus(it) !== filter.status)) return false
  if (filter.score && (!it || scoreVerdict(it) !== filter.score)) return false
  return true
}

function FilterChip({
  active,
  onClick,
  children,
  className,
}: {
  active: boolean
  onClick: () => void
  children: React.ReactNode
  className?: string
}) {
  return (
    <button type="button" onClick={onClick} aria-pressed={active}>
      <Badge
        variant={active ? 'default' : 'outline'}
        className={cn('cursor-pointer gap-1 font-normal', !active && 'text-muted-foreground', className)}
      >
        {children}
      </Badge>
    </button>
  )
}

export function RunFilterChips({ filter, onChange }: { filter: RunFilter; onChange: (f: RunFilter) => void }) {
  const toggleStatus = (s: RunStatus) => onChange({ ...filter, status: filter.status === s ? null : s })
  const toggleScore = (s: ScoreVerdict) => onChange({ ...filter, score: filter.score === s ? null : s })
  return (
    <div className="flex flex-wrap items-center gap-3">
      <div className="flex items-center gap-1.5">
        <span className="text-[11px] uppercase tracking-wider text-muted-foreground">Status</span>
        <FilterChip active={filter.status === 'ok'} onClick={() => toggleStatus('ok')}>
          <CircleCheck className="size-3" />
          ok
        </FilterChip>
        <FilterChip active={filter.status === 'error'} onClick={() => toggleStatus('error')}>
          <CircleAlert className="size-3" />
          error
        </FilterChip>
      </div>
      <div className="flex items-center gap-1.5">
        <span className="text-[11px] uppercase tracking-wider text-muted-foreground">Score</span>
        <FilterChip active={filter.score === 'pass'} onClick={() => toggleScore('pass')}>
          PASS
        </FilterChip>
        <FilterChip active={filter.score === 'fail'} onClick={() => toggleScore('fail')}>
          FAIL
        </FilterChip>
      </div>
    </div>
  )
}

export type Delta = 'regressed' | 'improved' | 'unchanged'

// Status flip wins over verdict (ok↔error is the louder signal); a pass↔unjudged
// shift carries no verdict, so it stays unchanged rather than faking a regression.
export function runItemDelta(baseline: DatasetRunItem | null, current: DatasetRunItem | null): Delta {
  if (!baseline || !current) return 'unchanged'
  const bStatus = runStatus(baseline)
  const cStatus = runStatus(current)
  if (bStatus !== cStatus) return cStatus === 'error' ? 'regressed' : 'improved'
  if (cStatus === 'error') return 'unchanged'

  const b = scoreVerdict(baseline)
  const c = scoreVerdict(current)
  if (b === c || b == null || c == null) return 'unchanged'
  return c === 'fail' ? 'regressed' : 'improved'
}

export interface CompareSummary {
  regressed: number
  improved: number
  unchanged: number
}

export function DeltaBadge({ delta }: { delta: Delta }) {
  if (delta === 'unchanged') return null
  const regressed = delta === 'regressed'
  const Icon = regressed ? ArrowDownRight : ArrowUpRight
  return (
    <Badge
      variant="outline"
      className={cn(
        'gap-1 font-medium uppercase',
        regressed ? 'border-destructive/40 text-destructive' : `border-emerald-600/40 ${ACCENT.emerald.status}`,
      )}
    >
      <Icon className="size-3" />
      {regressed ? 'regressed' : 'improved'}
    </Badge>
  )
}

export function CompareSummaryBar({
  summary,
  onlyRegressions,
  onToggleRegressions,
}: {
  summary: CompareSummary
  onlyRegressions: boolean
  onToggleRegressions: () => void
}) {
  const { regressed, improved } = summary
  return (
    <div className="flex flex-wrap items-center gap-3 text-xs">
      <span className="flex items-center gap-1.5 text-muted-foreground">
        Baseline → current
        <Minus className="size-3 opacity-40" />
      </span>
      <FilterChip
        active={onlyRegressions}
        onClick={onToggleRegressions}
        className={cn(!onlyRegressions && regressed > 0 && 'border-destructive/40 text-destructive')}
      >
        <ArrowDownRight className="size-3" />
        {regressed} {regressed === 1 ? 'regression' : 'regressions'}
      </FilterChip>
      <span className={cn('flex items-center gap-1', improved > 0 && ACCENT.emerald.status)}>
        <ArrowUpRight className="size-3" />
        {improved} {improved === 1 ? 'improvement' : 'improvements'}
      </span>
    </div>
  )
}
