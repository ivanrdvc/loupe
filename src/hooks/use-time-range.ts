import { useEffect, useState } from 'react'
import { DEFAULT, parse, serialize, type TimeRange } from '#/lib/time-range'

const STORAGE_KEY = 'sessions-time-range'

export function useTimeRange(): [TimeRange, (next: TimeRange) => void] {
  // SSR can't see localStorage — start from DEFAULT and sync on mount to keep
  // server and first client render in agreement.
  const [range, setState] = useState<TimeRange>(DEFAULT)
  useEffect(() => {
    const stored = window.localStorage.getItem(STORAGE_KEY)
    if (stored != null) setState(parse(stored))
  }, [])
  const setRange = (next: TimeRange) => {
    setState(next)
    window.localStorage.setItem(STORAGE_KEY, serialize(next))
  }
  return [range, setRange]
}
