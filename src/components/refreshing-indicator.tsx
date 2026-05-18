import { Loading03Icon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { cn } from '#/lib/utils'

interface RefreshingIndicatorProps {
  active: boolean
  label?: string
  className?: string
}

export function RefreshingIndicator({ active, label = 'Refreshing…', className }: RefreshingIndicatorProps) {
  return (
    <span
      role="status"
      aria-live="polite"
      aria-hidden={!active}
      className={cn(
        'pointer-events-none inline-flex items-center gap-1.5 text-xs text-muted-foreground transition-opacity duration-200',
        active ? 'opacity-100' : 'opacity-0',
        className,
      )}
    >
      <HugeiconsIcon icon={Loading03Icon} strokeWidth={2} className="size-3.5 animate-spin" />
      {label}
    </span>
  )
}
