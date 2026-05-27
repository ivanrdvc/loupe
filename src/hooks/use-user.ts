import { useCallback, useSyncExternalStore } from 'react'
import { buildCurrentUser, type CurrentUser } from '#/lib/current-user'

const USER_ID_KEY = 'loupe:user-id'
const SCOPE_TO_ME_KEY = 'loupe:scope-to-me'

function makeStore(key: string) {
  const listeners = new Set<() => void>()
  return {
    subscribe(cb: () => void) {
      listeners.add(cb)
      const onStorage = (event: StorageEvent) => {
        if (event.key === key) cb()
      }
      window.addEventListener('storage', onStorage)
      return () => {
        listeners.delete(cb)
        window.removeEventListener('storage', onStorage)
      }
    },
    notify() {
      for (const listener of listeners) listener()
    },
  }
}

const userIdStore = makeStore(USER_ID_KEY)
const scopeToMeStore = makeStore(SCOPE_TO_ME_KEY)

function readUserId(): string {
  if (typeof window === 'undefined') return ''
  return window.localStorage.getItem(USER_ID_KEY) ?? ''
}

function readScopeToMe(): boolean {
  if (typeof window === 'undefined') return false
  return window.localStorage.getItem(SCOPE_TO_ME_KEY) === '1'
}

export function useUserId(): [string, (next: string) => void] {
  const id = useSyncExternalStore(userIdStore.subscribe, readUserId, () => '')
  const setId = useCallback((next: string) => {
    if (typeof window === 'undefined') return
    const trimmed = next.trim()
    if (trimmed) window.localStorage.setItem(USER_ID_KEY, trimmed)
    else window.localStorage.removeItem(USER_ID_KEY)
    userIdStore.notify()
  }, [])
  return [id, setId]
}

export function useScopeToMe(): [boolean, (next: boolean) => void] {
  const on = useSyncExternalStore(scopeToMeStore.subscribe, readScopeToMe, () => false)
  const setOn = useCallback((next: boolean) => {
    if (typeof window === 'undefined') return
    if (next) window.localStorage.setItem(SCOPE_TO_ME_KEY, '1')
    else window.localStorage.removeItem(SCOPE_TO_ME_KEY)
    scopeToMeStore.notify()
  }, [])
  return [on, setOn]
}

// Returns the user id to filter list views by, or '' when scoping is off or
// no id is set. Use this for telemetry list queries — it collapses the two
// independent settings into the single value that matters downstream.
export function useScopedUserId(): string {
  const [id] = useUserId()
  const [on] = useScopeToMe()
  return on && id ? id : ''
}

export function useUser(): CurrentUser {
  const [id] = useUserId()
  return buildCurrentUser(id)
}
