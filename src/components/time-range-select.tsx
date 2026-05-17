import { CheckIcon, ChevronDownIcon } from '@heroicons/react/16/solid'
import { Dropdown, DropdownButton, DropdownItem, DropdownLabel, DropdownMenu } from '#/components/ui/catalyst/dropdown'
import { TIME_RANGE_DAYS, type TimeRangeDays, timeRangeLabel, timeRangeShortcut } from '#/lib/time-range'

interface TimeRangeSelectProps {
  value: TimeRangeDays
  onChange: (value: TimeRangeDays) => void
  options?: readonly TimeRangeDays[]
}

export function TimeRangeSelect({ value, onChange, options = TIME_RANGE_DAYS }: TimeRangeSelectProps) {
  return (
    <Dropdown>
      <DropdownButton
        as="button"
        className="inline-flex h-8 shrink-0 cursor-pointer items-center gap-1.5 rounded-md border border-zinc-950/10 bg-white px-2.5 text-sm/5 font-medium whitespace-nowrap text-zinc-950 shadow-xs transition-colors hover:bg-zinc-950/[0.03] focus:outline-hidden focus-visible:ring-2 focus-visible:ring-focus-500/80 disabled:cursor-not-allowed disabled:opacity-50 dark:border-white/10 dark:bg-white/[0.03] dark:text-zinc-100 dark:shadow-none dark:hover:bg-white/[0.07]"
      >
        <span className="font-mono text-xs tabular-nums">{timeRangeShortcut(value)}</span>
        <ChevronDownIcon data-slot="icon" className="size-4 fill-zinc-500 opacity-60 dark:fill-zinc-400" />
      </DropdownButton>
      <DropdownMenu anchor="bottom end" className="min-w-44">
        {options.map((days) => (
          <DropdownItem key={days} onClick={() => onChange(days)} className={controlMenuItemClass}>
            {value === days ? <CheckIcon data-slot="icon" /> : <span data-slot="icon" />}
            <DropdownLabel>{timeRangeLabel(days)}</DropdownLabel>
          </DropdownItem>
        ))}
      </DropdownMenu>
    </Dropdown>
  )
}

const controlMenuItemClass =
  '!cursor-pointer data-focus:!bg-zinc-100 data-focus:!text-zinc-950 dark:data-focus:!bg-white/10 dark:data-focus:!text-white dark:data-focus:*:data-[slot=icon]:!text-zinc-300'
