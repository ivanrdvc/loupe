import { createServerFn } from '@tanstack/react-start'
import { getRequest } from '@tanstack/react-start/server'
import { ensureOwnerSeeded } from './bootstrap'
import type { User } from './contract'
import { getCurrentUser } from './impl'

export const getSession = createServerFn({ method: 'GET' }).handler(async (): Promise<User | null> => {
  return getCurrentUser(getRequest().headers)
})

export const bootstrapOwner = createServerFn({ method: 'GET' }).handler(async () => {
  await ensureOwnerSeeded()
})
