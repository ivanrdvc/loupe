import { useCallback, useSyncExternalStore } from 'react'
import { AUTO_REFRESH_MS, type AutoRefreshInterval } from '#/components/auto-refresh-select'
import { createLocalStorageStore } from '#/lib/local-storage-store'

const VALID_KEYS = Object.keys(AUTO_REFRESH_MS) as readonly AutoRefreshInterval[]

function isInterval(v: unknown): v is AutoRefreshInterval {
  return typeof v === 'string' && (VALID_KEYS as readonly string[]).includes(v)
}

function createAutoRefreshHook(storageKey: string, defaultInterval: AutoRefreshInterval) {
  const store = createLocalStorageStore(storageKey)

  function read(): AutoRefreshInterval {
    if (typeof window === 'undefined') return defaultInterval
    const stored = window.localStorage.getItem(storageKey)
    return isInterval(stored) ? stored : defaultInterval
  }

  return function useAutoRefreshScoped(): [AutoRefreshInterval, (next: AutoRefreshInterval) => void] {
    const value = useSyncExternalStore(store.subscribe, read, () => defaultInterval)
    const setValue = useCallback((next: AutoRefreshInterval) => {
      if (typeof window === 'undefined') return
      window.localStorage.setItem(storageKey, next)
      store.notify()
    }, [])
    return [value, setValue]
  }
}

export const useAutoRefresh = createAutoRefreshHook('sessions-auto-refresh', '30s')
export const useInspectAutoRefresh = createAutoRefreshHook('inspect-auto-refresh', '5s')
