import clsx from 'clsx'
import type React from 'react'
import { Button } from './button'

const tightBtn =
  '!px-2 !py-0.5 !text-xs sm:!px-2 sm:!py-0.5 sm:!text-xs [&_[data-slot=icon]]:!size-3.5 sm:[&_[data-slot=icon]]:!size-3.5'

export function Pagination({
  'aria-label': ariaLabel = 'Page navigation',
  className,
  ...props
}: React.ComponentPropsWithoutRef<'nav'>) {
  return <nav aria-label={ariaLabel} {...props} className={clsx(className, 'flex gap-x-1')} />
}

type NavProps = {
  href?: string | null
  onClick?: () => void
  disabled?: boolean
  className?: string
}

function navButtonProps({ href, onClick, disabled }: NavProps) {
  if (disabled) return { disabled: true } as const
  if (onClick) return { onClick } as const
  if (href) return { href } as const
  return { disabled: true } as const
}

export function PaginationPrevious({
  href = null,
  onClick,
  disabled,
  className,
  children = 'Previous',
}: React.PropsWithChildren<NavProps>) {
  return (
    <span className={clsx(className, 'grow basis-0')}>
      <Button {...navButtonProps({ href, onClick, disabled })} plain aria-label="Previous page" className={tightBtn}>
        <svg className="stroke-current" data-slot="icon" viewBox="0 0 16 16" fill="none" aria-hidden="true">
          <path
            d="M2.75 8H13.25M2.75 8L5.25 5.5M2.75 8L5.25 10.5"
            strokeWidth={1.5}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
        {children}
      </Button>
    </span>
  )
}

export function PaginationNext({
  href = null,
  onClick,
  disabled,
  className,
  children = 'Next',
}: React.PropsWithChildren<NavProps>) {
  return (
    <span className={clsx(className, 'flex grow basis-0 justify-end')}>
      <Button {...navButtonProps({ href, onClick, disabled })} plain aria-label="Next page" className={tightBtn}>
        {children}
        <svg className="stroke-current" data-slot="icon" viewBox="0 0 16 16" fill="none" aria-hidden="true">
          <path
            d="M13.25 8L2.75 8M13.25 8L10.75 10.5M13.25 8L10.75 5.5"
            strokeWidth={1.5}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </Button>
    </span>
  )
}

export function PaginationList({ className, ...props }: React.ComponentPropsWithoutRef<'span'>) {
  return <span {...props} className={clsx(className, 'hidden items-baseline gap-x-1 sm:flex')} />
}

export function PaginationPage({
  href,
  onClick,
  className,
  current = false,
  children,
}: React.PropsWithChildren<{ href?: string; onClick?: () => void; className?: string; current?: boolean }>) {
  const props = onClick ? { onClick } : href ? { href } : { disabled: true as const }
  return (
    <Button
      {...props}
      plain
      aria-label={`Page ${children}`}
      aria-current={current ? 'page' : undefined}
      className={clsx(
        className,
        tightBtn,
        'min-w-7 before:absolute before:-inset-px before:rounded-md',
        current && 'before:bg-zinc-950/5 dark:before:bg-white/10',
      )}
    >
      <span className="-mx-0.5">{children}</span>
    </Button>
  )
}

export function PaginationGap({
  className,
  children = <>&hellip;</>,
  ...props
}: React.ComponentPropsWithoutRef<'span'>) {
  return (
    <span
      aria-hidden="true"
      {...props}
      className={clsx(className, 'w-7 text-center text-xs font-semibold text-zinc-950 select-none dark:text-white')}
    >
      {children}
    </span>
  )
}
