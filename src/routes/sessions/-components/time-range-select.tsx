import { IconCheck, IconChevronDown } from '@tabler/icons-react'
import { useEffect, useState } from 'react'
import { Button } from '#/components/ui/button'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '#/components/ui/dropdown-menu'
import { Separator } from '#/components/ui/separator'
import {
  DEFAULT_TIME_RANGE_DAYS,
  parseTimeRangeDays,
  TIME_RANGE_DAYS,
  type TimeRangeDays,
  timeRangeLabel,
  timeRangeShortcut,
} from '#/lib/time-range'

const STORAGE_KEY = 'sessions-2-time-range-days'

function useTimeRangeDays(): [TimeRangeDays, (next: TimeRangeDays) => void] {
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

export function TimeRangeSelect() {
  const [days, setDays] = useTimeRangeDays()
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm">
          <span className="text-muted-foreground">Range</span>
          <Separator orientation="vertical" className="mx-2 data-[orientation=vertical]:h-4" />
          <span className="tabular-nums">{timeRangeShortcut(days)}</span>
          <IconChevronDown />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-44">
        {TIME_RANGE_DAYS.map((option) => (
          <DropdownMenuItem key={option} onSelect={() => setDays(option)}>
            <IconCheck className={days === option ? 'opacity-100' : 'opacity-0'} />
            {timeRangeLabel(option)}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
