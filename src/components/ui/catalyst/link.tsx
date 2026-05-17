import * as Headless from '@headlessui/react'
import { Link as RouterLink } from '@tanstack/react-router'
import type React from 'react'
import { forwardRef } from 'react'

export const Link = forwardRef(function Link(
  {
    href,
    search,
    ...props
  }: { href: string; search?: Record<string, unknown> } & Omit<React.ComponentPropsWithoutRef<'a'>, 'href'>,
  ref: React.ForwardedRef<HTMLAnchorElement>,
) {
  return (
    <Headless.DataInteractive>
      <RouterLink to={href} search={search} {...props} ref={ref} />
    </Headless.DataInteractive>
  )
})
