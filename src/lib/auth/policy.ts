import type { Action, Resource, Role, User } from './contract'

const POLICY: Record<Role, Partial<Record<Resource, Action[]>>> = {
  owner: {
    agents: ['read', 'write'],
    datasets: ['read', 'write'],
    scores: ['read', 'write'],
    notes: ['read', 'write'],
    evals: ['read', 'write'],
    inventory: ['read', 'write'],
    inbox: ['read', 'write'],
    admin: ['read', 'write'],
  },
  editor: {
    agents: ['read'],
    datasets: ['read', 'write'],
    scores: ['read', 'write'],
    notes: ['read', 'write'],
    evals: ['read', 'write'],
    inventory: ['read'],
    inbox: ['read', 'write'],
  },
  viewer: {
    agents: ['read'],
    datasets: ['read'],
    scores: ['read'],
    notes: ['read'],
    evals: ['read'],
    inventory: ['read'],
    inbox: ['read'],
  },
}

export function can(user: User, action: Action, resource: Resource): boolean {
  return user.roles.some((role) => POLICY[role]?.[resource]?.includes(action) ?? false)
}
