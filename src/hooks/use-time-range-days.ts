import { useEffect, useState } from 'react'
import { DEFAULT_TIME_RANGE_DAYS, parseTimeRangeDays, type TimeRangeDays } from '#/lib/time-range'

const STORAGE_KEY = 'sessions-time-range-days'

export function useTimeRangeDays(): [TimeRangeDays, (next: TimeRangeDays) => void] {
  const [days, setState] = useState<TimeRangeDays>(DEFAULT_TIME_RANGE_DAYS)
  useEffect(() => {
    const stored = window.localStorage.getItem(STORAGE_KEY)
    if (stored != null) setState(parseTimeRangeDays(stored))
  }, [])
  const setDays = (next: TimeRangeDays) => {
    setState(next)
    window.localStorage.setItem(STORAGE_KEY, String(next))
  }
  return [days, setDays]
}
