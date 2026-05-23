import type * as React from 'react'
import { cn } from '#/lib/utils'

export function Kbd({ className, ...props }: React.ComponentProps<'kbd'>) {
  return (
    <kbd
      className={cn(
        'inline-flex h-5 min-w-5 select-none items-center justify-center gap-1 rounded border bg-muted px-1.5 font-medium text-[10px] text-muted-foreground',
        className,
      )}
      {...props}
    />
  )
}
