import { Calendar as CalendarIcon, ChevronDown, ChevronLeft } from 'lucide-react'
import { useEffect, useState } from 'react'
import type { DateRange } from 'react-day-picker'
import { Button } from '#/components/ui/button'
import { Calendar } from '#/components/ui/calendar'
import { Popover, PopoverContent, PopoverTrigger } from '#/components/ui/popover'
import { Separator } from '#/components/ui/separator'
import { formatDayMonth, label, PRESETS, type TimeRange } from '#/lib/time-range'
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
  const [draft, setDraft] = useState<DateRange | undefined>(
    isCustom ? { from: new Date(value.from), to: new Date(value.to) } : undefined,
  )

  useEffect(() => {
    if (!open) return
    setView(isCustom ? 'custom' : 'presets')
    setDraft(isCustom ? { from: new Date(value.from), to: new Date(value.to) } : undefined)
  }, [open, value, isCustom])

  const handlePreset = (days: number) => {
    onChange(days)
    setOpen(false)
  }

  const canApply = !!draft?.from
  const handleApply = () => {
    if (!draft?.from) return
    const fromMs = startOfDay(draft.from).getTime()
    const sameDay = draft.to && startOfDay(draft.to).getTime() === fromMs
    const toMs = !draft.to || sameDay ? Date.now() : endOfDay(draft.to).getTime()
    onChange({ from: fromMs, to: toMs })
    setOpen(false)
  }

  const triggerLabel = isCustom ? `${formatDayMonth(value.from)} – ${formatDayMonth(value.to)}` : label(value)

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label="Time range"
          data-state={open ? 'open' : 'closed'}
          className={cn(
            'inline-flex h-8 items-center gap-x-1.5 rounded-md border border-border bg-transparent px-2.5 text-sm whitespace-nowrap transition-colors outline-none select-none',
            'hover:bg-accent/40 dark:bg-input/30 dark:hover:bg-input/50',
            'focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50',
            'data-[state=open]:border-ring data-[state=open]:ring-2 data-[state=open]:ring-ring/30',
          )}
        >
          <CalendarIcon className="-ml-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
          <span className="max-w-[180px] truncate">{triggerLabel}</span>
          <ChevronDown className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" sideOffset={4} className="w-auto rounded-lg p-0">
        {view === 'presets' ? (
          <div className="flex w-44 flex-col gap-0.5 p-2">
            {options.map((days) => {
              const isActive = !isCustom && value === days
              return (
                <button
                  key={days}
                  type="button"
                  onClick={() => handlePreset(days)}
                  className={cn(
                    'flex h-7 items-center rounded-md px-2 text-left text-sm transition-colors',
                    isActive
                      ? 'bg-accent font-medium text-accent-foreground'
                      : 'hover:bg-accent hover:text-accent-foreground',
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
                'flex h-7 items-center rounded-md px-2 text-left text-sm transition-colors',
                isCustom
                  ? 'bg-accent font-medium text-accent-foreground'
                  : 'hover:bg-accent hover:text-accent-foreground',
              )}
            >
              Custom range…
            </button>
          </div>
        ) : (
          <div className="flex flex-col">
            <div className="flex items-center gap-1 border-b p-1.5">
              <Button variant="ghost" size="icon-sm" aria-label="Back to presets" onClick={() => setView('presets')}>
                <ChevronLeft className="size-3.5" aria-hidden />
              </Button>
              <span className="text-xs font-medium">Custom range</span>
            </div>
            <Calendar
              mode="range"
              numberOfMonths={1}
              selected={draft}
              onSelect={setDraft}
              defaultMonth={draft?.from ?? new Date()}
              disabled={{ after: new Date() }}
            />
            <div className="flex items-center justify-between gap-2 border-t p-2">
              <span className="px-1 text-xs text-muted-foreground">{previewLabel(draft)}</span>
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

function previewLabel(draft: DateRange | undefined): string {
  if (!draft?.from) return 'Pick a date'
  const from = formatDayMonth(draft.from)
  const sameDay = draft.to && startOfDay(draft.to).getTime() === startOfDay(draft.from).getTime()
  if (!draft.to || sameDay) return `${from} – now`
  return `${from} – ${formatDayMonth(draft.to)}`
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
