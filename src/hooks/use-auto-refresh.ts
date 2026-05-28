import { useCallback, useSyncExternalStore } from 'react'
import { AUTO_REFRESH_MS, type AutoRefreshInterval } from '#/components/auto-refresh-select'

const VALID_KEYS = Object.keys(AUTO_REFRESH_MS) as readonly AutoRefreshInterval[]

function isInterval(v: unknown): v is AutoRefreshInterval {
  return typeof v === 'string' && (VALID_KEYS as readonly string[]).includes(v)
}

function createAutoRefreshHook(storageKey: string, defaultInterval: AutoRefreshInterval) {
  const listeners = new Set<() => void>()

  function subscribe(cb: () => void) {
    listeners.add(cb)
    const onStorage = (event: StorageEvent) => {
      if (event.key === storageKey) cb()
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
    if (typeof window === 'undefined') return defaultInterval
    const stored = window.localStorage.getItem(storageKey)
    return isInterval(stored) ? stored : defaultInterval
  }

  return function useAutoRefreshScoped(): [AutoRefreshInterval, (next: AutoRefreshInterval) => void] {
    const value = useSyncExternalStore(subscribe, read, () => defaultInterval)
    const setValue = useCallback((next: AutoRefreshInterval) => {
      if (typeof window === 'undefined') return
      window.localStorage.setItem(storageKey, next)
      notify()
    }, [])
    return [value, setValue]
  }
}

export const useAutoRefresh = createAutoRefreshHook('sessions-auto-refresh', '30s')
export const useInspectAutoRefresh = createAutoRefreshHook('inspect-auto-refresh', '5s')
