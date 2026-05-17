import { useState } from 'react'
import { DEFAULT, parse, serialize, type TimeRange } from '#/lib/time-range'

const STORAGE_KEY = 'sessions-time-range'

export function useTimeRange(): [TimeRange, (next: TimeRange) => void] {
  // Lazy initializer reads localStorage on first client render, avoiding the
  // default-then-stored flip that caused a second fetch on every page load.
  const [range, setState] = useState<TimeRange>(() => {
    if (typeof window === 'undefined') return DEFAULT
    const stored = window.localStorage.getItem(STORAGE_KEY)
    return stored != null ? parse(stored) : DEFAULT
  })
  const setRange = (next: TimeRange) => {
    setState(next)
    window.localStorage.setItem(STORAGE_KEY, serialize(next))
  }
  return [range, setRange]
}
