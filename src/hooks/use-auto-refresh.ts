import { useCallback, useSyncExternalStore } from 'react'
import {
  type AutoRefreshInterval,
  DEFAULT_AUTO_REFRESH_INTERVAL,
  LIST_AUTO_REFRESH_OPTIONS,
} from '#/components/auto-refresh-select'

const STORAGE_KEY = 'sessions-auto-refresh'

function isInterval(v: unknown): v is AutoRefreshInterval {
  return typeof v === 'string' && (LIST_AUTO_REFRESH_OPTIONS as readonly string[]).includes(v)
}

const listeners = new Set<() => void>()

function subscribe(cb: () => void) {
  listeners.add(cb)
  const onStorage = (event: StorageEvent) => {
    if (event.key === STORAGE_KEY) cb()
  }
  window.addEventListener('storage', onStorage)
  return () => {
    listeners.delete(cb)
    window.removeEventListener('storage', onStorage)
  }
}

function notify() {
  for (const listener of listeners) listener()
}

function read(): AutoRefreshInterval {
  if (typeof window === 'undefined') return DEFAULT_AUTO_REFRESH_INTERVAL
  const stored = window.localStorage.getItem(STORAGE_KEY)
  return isInterval(stored) ? stored : DEFAULT_AUTO_REFRESH_INTERVAL
}

export function useAutoRefresh(): [AutoRefreshInterval, (next: AutoRefreshInterval) => void] {
  const value = useSyncExternalStore(subscribe, read, () => DEFAULT_AUTO_REFRESH_INTERVAL)
  const setValue = useCallback((next: AutoRefreshInterval) => {
    if (typeof window === 'undefined') return
    window.localStorage.setItem(STORAGE_KEY, next)
    notify()
  }, [])
  return [value, setValue]
}
