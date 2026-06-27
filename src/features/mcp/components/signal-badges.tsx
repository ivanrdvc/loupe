import { Badge } from '#/components/ui/badge'
import { cn } from '#/lib/utils'
import { TOOL_SIGNAL_DESCRIPTIONS, type ToolSignal } from '../logic/signals'

export function SignalBadges({ signals, className }: { signals: readonly ToolSignal[]; className?: string }) {
  if (signals.length === 0) return null
  return (
    <span className={cn('flex flex-wrap gap-1', className)}>
      {signals.map((s) => (
        <Badge
          key={s}
          variant={s === 'unbounded' || s === 'bulk' ? 'warning' : 'outline'}
          className="font-normal"
          title={TOOL_SIGNAL_DESCRIPTIONS[s]}
        >
          {s}
        </Badge>
      ))}
    </span>
  )
}
