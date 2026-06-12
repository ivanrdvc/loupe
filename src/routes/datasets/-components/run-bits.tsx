import { CircleAlert, CircleCheck, TriangleAlert } from 'lucide-react'
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
