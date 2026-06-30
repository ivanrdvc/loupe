export type Role = 'owner' | 'editor' | 'viewer'
export const ROLES: Role[] = ['owner', 'editor', 'viewer']
export type Action = 'read' | 'write'
export type Resource = 'agents' | 'datasets' | 'scores' | 'notes' | 'evals' | 'inventory' | 'inbox' | 'admin'

export type User = {
  id: string
  email: string
  name: string
  roles: Role[]
}

/** Map a better-auth session user (single `role` string) to the app User. */
export function toUser(
  sessionUser: { id: string; email: string; name: string; role?: string } | null | undefined,
): User | null {
  if (!sessionUser) return null
  const role = sessionUser.role as Role | undefined
  return {
    id: sessionUser.id,
    email: sessionUser.email,
    name: sessionUser.name,
    roles: role ? [role] : [],
  }
}
