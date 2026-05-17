import { useEffect, useState } from 'react'
import {
  AUTO_REFRESH_OPTIONS,
  type AutoRefreshInterval,
  DEFAULT_AUTO_REFRESH_INTERVAL,
} from '#/components/auto-refresh-select'

const STORAGE_KEY = 'sessions-auto-refresh'

function isInterval(v: unknown): v is AutoRefreshInterval {
  return typeof v === 'string' && AUTO_REFRESH_OPTIONS.some((o) => o.value === v)
}

export function useAutoRefresh(): [AutoRefreshInterval, (next: AutoRefreshInterval) => void] {
  const [interval, setState] = useState<AutoRefreshInterval>(DEFAULT_AUTO_REFRESH_INTERVAL)
  useEffect(() => {
    const stored = window.localStorage.getItem(STORAGE_KEY)
    if (isInterval(stored)) setState(stored)
  }, [])
  const setInterval = (next: AutoRefreshInterval) => {
    setState(next)
    window.localStorage.setItem(STORAGE_KEY, next)
  }
  return [interval, setInterval]
}
