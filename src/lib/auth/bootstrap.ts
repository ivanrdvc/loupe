import { eq } from 'drizzle-orm'
import { db } from '#/db'
import { user } from '#/db/schema'
import { auth } from './server'

let seeded = false

/**
 * Create the owner account from LOUPE_OWNER_EMAIL/PASSWORD on first run.
 * No-op once any user exists, so it never overrides later signups.
 */
export async function ensureOwnerSeeded(): Promise<void> {
  if (seeded) return
  const email = process.env.LOUPE_OWNER_EMAIL
  const password = process.env.LOUPE_OWNER_PASSWORD
  if (!email || !password) return
  const existing = await db.select({ id: user.id }).from(user).limit(1)
  if (existing.length > 0) {
    seeded = true
    return
  }
  await auth.api.signUpEmail({ body: { email, password, name: email.split('@')[0] } })
  await db.update(user).set({ role: 'owner' }).where(eq(user.email, email))
  seeded = true
}
