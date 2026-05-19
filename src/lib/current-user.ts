export type CurrentUser = {
  id?: string
  name: string
  email: string
  initials: string
}

export const DEFAULT_USER: CurrentUser = {
  name: 'Anonymous',
  email: 'you@example.com',
  initials: 'AN',
}

export function initialsFor(nameOrEmail: string): string {
  const value = nameOrEmail.trim()
  if (!value) return DEFAULT_USER.initials

  const nameParts = value
    .replace(/@.*/, '')
    .split(/[\s._-]+/)
    .filter(Boolean)

  const initials = nameParts
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join('')

  return initials || DEFAULT_USER.initials
}

export function buildCurrentUser(id: string | null | undefined): CurrentUser {
  const trimmed = id?.trim() ?? ''
  if (!trimmed) return DEFAULT_USER
  return {
    id: trimmed,
    name: trimmed,
    email: trimmed,
    initials: initialsFor(trimmed),
  }
}
