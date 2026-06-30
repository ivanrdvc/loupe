import { toUser, type User } from './contract'
import { auth } from './server'

/** Resolve the authenticated user from request headers, or null. */
export async function getCurrentUser(headers: Headers): Promise<User | null> {
  const result = await auth.api.getSession({ headers })
  return toUser(result?.user as { id: string; email: string; name: string; role?: string } | undefined)
}

/**
 * Gate for the machine-facing /api surface. When `LOUPE_API_KEY` is set, callers
 * must present it as a bearer token. With no key set the surface is open only to
 * localhost (dev trust); a remote deployment that forgets the key fails closed
 * rather than serving all telemetry anonymously.
 */
export function authorizeApiRequest(headers: Headers): boolean {
  const key = process.env.LOUPE_API_KEY
  if (key) return headers.get('authorization') === `Bearer ${key}`
  const host = (headers.get('host') ?? '').split(':')[0]
  return host === 'localhost' || host === '127.0.0.1' || host === '[::1]' || host === '::1'
}
