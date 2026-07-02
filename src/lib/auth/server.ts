import { betterAuth } from 'better-auth'
import { drizzleAdapter } from 'better-auth/adapters/drizzle'
import { tanstackStartCookies } from 'better-auth/tanstack-start'
import { db } from '#/db'
import { account, session, user, verification } from '#/db/schema'

export const auth = betterAuth({
  baseURL: process.env.BETTER_AUTH_URL,
  secret: process.env.BETTER_AUTH_SECRET,
  database: drizzleAdapter(db, {
    provider: 'sqlite',
    schema: { user, session, account, verification },
  }),
  emailAndPassword: { enabled: true },
  // Serve the common session lookup from a signed cookie so each guard call
  // (ensureSession/requireCan) doesn't round-trip the session table.
  session: { cookieCache: { enabled: true, maxAge: 60 } },
  // input: false keeps role out of self-signup; defaults to editor.
  user: { additionalFields: { role: { type: 'string', defaultValue: 'editor', input: false } } },
  plugins: [tanstackStartCookies()], // must stay last
})
