import clsx from 'clsx'
import type React from 'react'

export function Logo({ className, ...props }: { className?: string } & React.ComponentPropsWithoutRef<'span'>) {
  return (
    <span
      data-slot="avatar"
      {...props}
      className={clsx(className, 'inline-grid shrink-0 place-items-center align-middle')}
    >
      <svg viewBox="0 0 100 100" className="size-full" aria-hidden="true">
        <rect width="100" height="100" rx="22" fill="#09090b" />
        <rect x="22" y="30" width="64" height="18" rx="9" fill="#a78bfa" />
        <rect x="14" y="54" width="64" height="18" rx="9" fill="#a78bfa" />
      </svg>
    </span>
  )
}
