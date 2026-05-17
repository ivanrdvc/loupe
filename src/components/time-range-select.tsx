import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '#/components/ui/select'
import { Separator } from '#/components/ui/separator'
import {
  parseTimeRangeDays,
  TIME_RANGE_DAYS,
  type TimeRangeDays,
  timeRangeLabel,
  timeRangeShortcut,
} from '#/lib/time-range'

interface TimeRangeSelectProps {
  value: TimeRangeDays
  onChange: (value: TimeRangeDays) => void
  options?: readonly TimeRangeDays[]
}

export function TimeRangeSelect({ value, onChange, options = TIME_RANGE_DAYS }: TimeRangeSelectProps) {
  return (
    <Select value={String(value)} onValueChange={(v) => onChange(parseTimeRangeDays(v))}>
      <SelectTrigger size="sm" aria-label="Time range">
        <span className="text-muted-foreground">Range</span>
        <Separator orientation="vertical" className="data-[orientation=vertical]:h-3.5" />
        <SelectValue>
          <span className="tabular-nums">{timeRangeShortcut(value)}</span>
        </SelectValue>
      </SelectTrigger>
      <SelectContent position="popper" align="end">
        {options.map((days) => (
          <SelectItem key={days} value={String(days)}>
            {timeRangeLabel(days)}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}
