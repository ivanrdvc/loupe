import { Tick02Icon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { Button } from '#/components/ui/button'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '#/components/ui/dropdown-menu'
import { TIME_RANGE_DAYS, type TimeRangeDays, timeRangeLabel, timeRangeShortcut } from '#/lib/time-range'

interface TimeRangeSelectProps {
  value: TimeRangeDays
  onChange: (value: TimeRangeDays) => void
  options?: readonly TimeRangeDays[]
}

export function TimeRangeSelect({ value, onChange, options = TIME_RANGE_DAYS }: TimeRangeSelectProps) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm">
          <span className="font-mono text-[11px] tabular-nums">{timeRangeShortcut(value)}</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-44">
        {options.map((days) => (
          <DropdownMenuItem key={days} onSelect={() => onChange(days)}>
            <HugeiconsIcon icon={Tick02Icon} className={value === days ? 'opacity-100' : 'opacity-0'} />
            {timeRangeLabel(days)}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
