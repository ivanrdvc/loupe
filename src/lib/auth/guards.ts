import { redirect } from '@tanstack/react-router'
import { getRequest, setResponseStatus } from '@tanstack/react-start/server'
import type { Action, Resource, User } from './contract'
import { authorizeApiRequest, getCurrentUser } from './impl'
import { can } from './policy'

/** 401 Response when the machine-facing API request is not authorized, else null. */
export function apiGuard(request: Request): Response | null {
  return authorizeApiRequest(request.headers) ? null : new Response('Unauthorized', { status: 401 })
}

export class ForbiddenError extends Error {
  constructor(message = 'Forbidden') {
    super(message)
    this.name = 'ForbiddenError'
  }
}

/** No live session (signed-out or expired mid-session) routes to /login rather than surfacing a 500. */
export async function ensureSession(): Promise<User> {
  const user = await getCurrentUser(getRequest().headers)
  if (!user) throw redirect({ to: '/login' })
  return user
}

export async function requireCan(action: Action, resource: Resource): Promise<User> {
  const user = await ensureSession()
  if (!can(user, action, resource)) {
    setResponseStatus(403)
    throw new ForbiddenError(`Not allowed to ${action} ${resource}`)
  }
  return user
}
