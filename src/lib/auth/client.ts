import { inferAdditionalFields } from 'better-auth/client/plugins'
import { createAuthClient } from 'better-auth/react'
import type { Action, Resource } from './contract'
import { toUser } from './contract'
import { can } from './policy'
import type { auth } from './server'

export const authClient = createAuthClient({
  plugins: [inferAdditionalFields<typeof auth>()],
})

export const { signIn, signUp, signOut, useSession } = authClient

export function useCurrentUser() {
  return authClient.useSession().data?.user ?? null
}

export function useCan(action: Action, resource: Resource): boolean {
  const user = toUser(useCurrentUser())
  return user ? can(user, action, resource) : false
}
