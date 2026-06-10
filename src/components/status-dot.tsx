import { cn } from '#/lib/utils'

/** Colored via text-* on the parent or className (bg/glow follow currentColor). */
export function StatusDot({ pulse, className }: { pulse?: boolean; className?: string }) {
  return (
    <span
      aria-hidden
      className={cn(
        'inline-block size-1.5 shrink-0 rounded-full bg-current shadow-[0_0_8px_currentColor]',
        pulse && 'animate-status-pulse',
        className,
      )}
    />
  )
}
