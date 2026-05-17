import clsx from 'clsx'
import type React from 'react'

export function Logo({ className, ...props }: { className?: string } & React.ComponentPropsWithoutRef<'span'>) {
  return (
    <span
      data-slot="avatar"
      {...props}
      className={clsx(
        className,
        'inline-grid shrink-0 place-items-center rounded-[20%] align-middle',
        'outline -outline-offset-1 outline-border',
        'bg-foreground text-background',
      )}
    >
      <svg
        viewBox="0 0 100 100"
        className="size-full p-[22%]"
        fill="none"
        stroke="currentColor"
        strokeWidth="10"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <polyline points="0,55 22,55 33,38 50,78 62,18 72,55 100,55" />
      </svg>
    </span>
  )
}
