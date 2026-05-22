import { ArrowLeft01Icon, UnfoldMoreIcon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { useEffect, useState } from 'react'
import type { DateRange } from 'react-day-picker'
import { Button } from '#/components/ui/button'
import { Calendar } from '#/components/ui/calendar'
import { Popover, PopoverContent, PopoverTrigger } from '#/components/ui/popover'
import { Separator } from '#/components/ui/separator'
import { formatDayMonth, label, PRESETS, shortcut, type TimeRange } from '#/lib/time-range'
import { cn } from '#/lib/utils'

interface TimeRangeSelectProps {
  value: TimeRange
  onChange: (value: TimeRange) => void
  options?: readonly number[]
}

type View = 'presets' | 'custom'

export function TimeRangeSelect({ value, onChange, options = PRESETS }: TimeRangeSelectProps) {
  const [open, setOpen] = useState(false)
  const isCustom = typeof value !== 'number'
  const [view, setView] = useState<View>(isCustom ? 'custom' : 'presets')
  const [selected, setSelected] = useState<DateRange | undefined>(
    isCustom ? { from: new Date(value.from), to: new Date(value.to) } : undefined,
  )

  useEffect(() => {
    if (!open) return
    setView(isCustom ? 'custom' : 'presets')
    setSelected(isCustom ? { from: new Date(value.from), to: new Date(value.to) } : undefined)
  }, [open, value, isCustom])

  const handlePreset = (days: number) => {
    onChange(days)
    setOpen(false)
  }

  const handleApply = () => {
    if (!selected?.from) return
    const fromMs = startOfDay(selected.from).getTime()
    // Single-date selection means "from that day to now"; full range means absolute window.
    const sameDay = selected.to && startOfDay(selected.to).getTime() === fromMs
    const toMs = !selected.to || sameDay ? Date.now() : endOfDay(selected.to).getTime()
    onChange({ from: fromMs, to: toMs })
    setOpen(false)
  }

  const canApply = !!selected?.from

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label="Time range"
          data-slot="select-trigger"
          data-size="sm"
          data-state={open ? 'open' : 'closed'}
          className={cn(
            // verbatim SelectTrigger classes (radix-mira preset):
            "flex w-fit items-center justify-between gap-1.5 rounded-lg border border-input bg-transparent py-2 pr-2 pl-2.5 text-sm whitespace-nowrap transition-colors outline-none select-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50 data-[size=default]:h-8 data-[size=sm]:h-7 data-[size=sm]:rounded-[min(var(--radius-md),10px)] dark:bg-input/30 dark:hover:bg-input/50 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
            // sibling overrides (match EnvSelect / AutoRefreshSelect):
            'border-border bg-transparent',
            // open state, matches focus-visible look:
            'data-[state=open]:border-ring data-[state=open]:ring-2 data-[state=open]:ring-ring/30',
          )}
        >
          <span className="text-muted-foreground">Range</span>
          <Separator orientation="vertical" className="data-[orientation=vertical]:h-3.5" />
          <span className="tabular-nums">{shortcut(value)}</span>
          <HugeiconsIcon
            icon={UnfoldMoreIcon}
            strokeWidth={2}
            className="pointer-events-none size-4 text-muted-foreground"
          />
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        sideOffset={4}
        className="w-auto rounded-lg p-0 text-popover-foreground shadow-md ring-1 ring-foreground/10"
      >
        {view === 'presets' ? (
          <div className="flex w-44 flex-col p-1">
            {options.map((days) => {
              const isActive = value === days
              return (
                <button
                  key={days}
                  type="button"
                  onClick={() => handlePreset(days)}
                  className={cn(
                    'flex h-7 items-center rounded-md px-2 text-left text-sm',
                    isActive ? 'bg-accent text-accent-foreground' : 'hover:bg-accent hover:text-accent-foreground',
                  )}
                >
                  {label(days)}
                </button>
              )
            })}
            <Separator className="my-1" />
            <button
              type="button"
              onClick={() => setView('custom')}
              className={cn(
                'flex h-7 items-center rounded-md px-2 text-left text-sm',
                isCustom ? 'bg-accent text-accent-foreground' : 'hover:bg-accent hover:text-accent-foreground',
              )}
            >
              Custom range…
            </button>
          </div>
        ) : (
          <div className="flex flex-col">
            <div className="flex items-center gap-1 border-b p-1.5">
              <Button variant="ghost" size="icon-sm" aria-label="Back to presets" onClick={() => setView('presets')}>
                <HugeiconsIcon icon={ArrowLeft01Icon} strokeWidth={2} className="size-3.5" />
              </Button>
              <span className="text-xs font-medium">Custom range</span>
            </div>
            <Calendar
              mode="range"
              numberOfMonths={1}
              selected={selected}
              onSelect={setSelected}
              defaultMonth={selected?.from ?? new Date()}
            />
            <div className="flex items-center justify-between gap-2 border-t p-2">
              <span className="px-1 text-xs text-muted-foreground">{previewLabel(selected)}</span>
              <div className="flex gap-2">
                <Button variant="ghost" size="sm" onClick={() => setOpen(false)}>
                  Cancel
                </Button>
                <Button size="sm" disabled={!canApply} onClick={handleApply}>
                  Apply
                </Button>
              </div>
            </div>
          </div>
        )}
      </PopoverContent>
    </Popover>
  )
}

function previewLabel(selected: DateRange | undefined): string {
  if (!selected?.from) return 'Pick a date'
  const from = formatDayMonth(selected.from)
  const sameDay = selected.to && startOfDay(selected.to).getTime() === startOfDay(selected.from).getTime()
  if (!selected.to || sameDay) return `${from} – now`
  return `${from} – ${formatDayMonth(selected.to)}`
}

function startOfDay(date: Date): Date {
  const d = new Date(date)
  d.setHours(0, 0, 0, 0)
  return d
}

function endOfDay(date: Date): Date {
  const d = new Date(date)
  d.setHours(23, 59, 59, 999)
  return d
}
