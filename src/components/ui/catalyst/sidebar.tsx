'use client'

import * as Headless from '@headlessui/react'
import clsx from 'clsx'
import type React from 'react'
import { forwardRef } from 'react'
import { TouchTarget } from './button'
import { Link } from './link'

export function Sidebar({ className, ...props }: React.ComponentPropsWithoutRef<'nav'>) {
  return <nav {...props} className={clsx(className, 'flex h-full min-h-0 flex-col')} />
}

export function SidebarHeader({ className, ...props }: React.ComponentPropsWithoutRef<'div'>) {
  return (
    <div
      {...props}
      className={clsx(
        className,
        'flex flex-col border-b border-zinc-950/5 p-3 dark:border-white/5 [&>[data-slot=section]+[data-slot=section]]:mt-2.5',
      )}
    />
  )
}

export function SidebarBody({ className, ...props }: React.ComponentPropsWithoutRef<'div'>) {
  return (
    <div
      {...props}
      className={clsx(
        className,
        'flex flex-1 flex-col overflow-y-auto p-3 [&>[data-slot=section]+[data-slot=section]]:mt-3',
      )}
    />
  )
}

export function SidebarFooter({ className, ...props }: React.ComponentPropsWithoutRef<'div'>) {
  return (
    <div
      {...props}
      className={clsx(
        className,
        'flex flex-col border-t border-zinc-950/5 p-3 dark:border-white/5 [&>[data-slot=section]+[data-slot=section]]:mt-2.5',
      )}
    />
  )
}

export function SidebarSection({ className, ...props }: React.ComponentPropsWithoutRef<'div'>) {
  return <div {...props} data-slot="section" className={clsx('flex flex-col gap-1', className)} />
}

export function SidebarDivider({ className, ...props }: React.ComponentPropsWithoutRef<'hr'>) {
  return <hr {...props} className={clsx(className, 'my-4 border-t border-zinc-950/5 lg:-mx-3 dark:border-white/5')} />
}

export function SidebarSpacer({ className, ...props }: React.ComponentPropsWithoutRef<'div'>) {
  return <div aria-hidden="true" {...props} className={clsx(className, 'mt-8 flex-1')} />
}

export function SidebarHeading({ className, ...props }: React.ComponentPropsWithoutRef<'h3'>) {
  return (
    <h3
      {...props}
      className={clsx(className, 'px-2.5 pb-1.5 text-xs/4 font-medium text-zinc-500 dark:text-zinc-400')}
    />
  )
}

export const SidebarItem = forwardRef(function SidebarItem(
  {
    current,
    className,
    children,
    ...props
  }: { current?: boolean; className?: string; children: React.ReactNode } & (
    | ({ href?: never } & Omit<Headless.ButtonProps, 'as' | 'className'>)
    | ({ href: string } & Omit<Headless.ButtonProps<typeof Link>, 'as' | 'className'>)
  ),
  ref: React.ForwardedRef<HTMLAnchorElement | HTMLButtonElement>,
) {
  const classes = clsx(
    // Base
    'flex w-full cursor-pointer items-center gap-2 rounded-md px-2.5 py-2 text-left text-base/6 font-normal text-zinc-950 transition-colors duration-150 sm:py-1.5 sm:text-sm/5',
    // Leading icon/icon-only
    '*:data-[slot=icon]:size-6 *:data-[slot=icon]:shrink-0 *:data-[slot=icon]:text-zinc-500 *:data-[slot=icon]:transition-colors *:data-[slot=icon]:duration-150 sm:*:data-[slot=icon]:size-5',
    // Trailing icon (down chevron or similar)
    '*:last:data-[slot=icon]:ml-auto *:last:data-[slot=icon]:size-5 sm:*:last:data-[slot=icon]:size-4',
    // Avatar
    '*:data-[slot=avatar]:-m-0.5 *:data-[slot=avatar]:size-7 sm:*:data-[slot=avatar]:size-6',
    // Hover
    'data-hover:bg-zinc-950/5 data-hover:*:data-[slot=icon]:text-zinc-950',
    // Active
    'data-active:bg-zinc-950/5 data-active:*:data-[slot=icon]:text-zinc-950',
    // Current (neutral — stronger than hover, no brand accent)
    'data-current:bg-zinc-950/10 data-current:text-zinc-950 data-current:*:data-[slot=icon]:text-zinc-950',
    // Dark mode
    'dark:text-white dark:*:data-[slot=icon]:text-zinc-400',
    'dark:data-hover:bg-white/5 dark:data-hover:*:data-[slot=icon]:text-white',
    'dark:data-active:bg-white/5 dark:data-active:*:data-[slot=icon]:text-white',
    'dark:data-current:bg-white/15 dark:data-current:text-white dark:data-current:*:data-[slot=icon]:text-white',
  )

  return typeof props.href === 'string' ? (
    <Headless.CloseButton
      as={Link}
      {...props}
      className={clsx(className, classes)}
      data-current={current ? 'true' : undefined}
      ref={ref}
    >
      <TouchTarget>{children}</TouchTarget>
    </Headless.CloseButton>
  ) : (
    <Headless.Button
      {...props}
      className={clsx(className, classes)}
      data-current={current ? 'true' : undefined}
      ref={ref}
    >
      <TouchTarget>{children}</TouchTarget>
    </Headless.Button>
  )
})

export function SidebarLabel({ className, ...props }: React.ComponentPropsWithoutRef<'span'>) {
  return <span {...props} className={clsx(className, 'truncate')} />
}
