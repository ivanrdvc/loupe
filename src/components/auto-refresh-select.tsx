import { Refresh01Icon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { IconChevronDown } from '@tabler/icons-react'
import { useState } from 'react'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from '#/components/ui/dropdown-menu'
import { cn } from '#/lib/utils'

type IntervalDef = { label: string; selectedLabel: string; ms: false | number }

const AUTO_REFRESH_INTERVALS = {
  off: { label: 'Off', selectedLabel: 'Off', ms: false },
  '5s': { label: 'Every 5s', selectedLabel: '5s', ms: 5_000 },
  '30s': { label: 'Every 30s', selectedLabel: '30s', ms: 30_000 },
  '1m': { label: 'Every 1 min', selectedLabel: '1m', ms: 60_000 },
  '5m': { label: 'Every 5 min', selectedLabel: '5m', ms: 5 * 60_000 },
  '15m': { label: 'Every 15 min', selectedLabel: '15m', ms: 15 * 60_000 },
} as const satisfies Record<string, IntervalDef>

export type AutoRefreshInterval = keyof typeof AUTO_REFRESH_INTERVALS

export const AUTO_REFRESH_MS = Object.fromEntries(
  Object.entries(AUTO_REFRESH_INTERVALS).map(([key, def]) => [key, def.ms]),
) as Record<AutoRefreshInterval, false | number>

export const LIST_AUTO_REFRESH_OPTIONS = [
  'off',
  '30s',
  '1m',
  '5m',
  '15m',
] as const satisfies readonly AutoRefreshInterval[]

export const DRAWER_AUTO_REFRESH_OPTIONS = [
  'off',
  '5s',
  '30s',
  '1m',
  '5m',
] as const satisfies readonly AutoRefreshInterval[]

export const DEFAULT_AUTO_REFRESH_INTERVAL: AutoRefreshInterval = '30s'
export const DRAWER_DEFAULT_AUTO_REFRESH_INTERVAL: AutoRefreshInterval = '5s'

interface AutoRefreshSelectProps {
  value: AutoRefreshInterval
  onChange: (value: AutoRefreshInterval) => void
  onRefresh?: () => void
  loading?: boolean
  options?: readonly AutoRefreshInterval[]
}

const SPIN_MS = 700

export function AutoRefreshSelect({
  value,
  onChange,
  onRefresh,
  loading = false,
  options = LIST_AUTO_REFRESH_OPTIONS,
}: AutoRefreshSelectProps) {
  const selected = AUTO_REFRESH_INTERVALS[value]
  const [spin, setSpin] = useState(false)
  const handleRefresh = () => {
    if (!onRefresh) return
    setSpin(true)
    onRefresh()
    window.setTimeout(() => setSpin(false), SPIN_MS)
  }

  return (
    <div
      className={cn(
        'inline-flex h-8 items-stretch rounded-md border border-border bg-transparent text-sm',
        'dark:bg-input/30',
        'focus-within:border-ring focus-within:ring-3 focus-within:ring-ring/50',
      )}
    >
      <button
        type="button"
        aria-label="Refresh now"
        onClick={handleRefresh}
        disabled={!onRefresh || loading}
        className={cn(
          'inline-flex items-center rounded-l-[5px] px-2 outline-none transition-colors',
          'hover:bg-accent/40 dark:hover:bg-input/50',
          'disabled:cursor-not-allowed disabled:opacity-50',
        )}
      >
        <HugeiconsIcon
          icon={Refresh01Icon}
          className={cn('size-4 shrink-0', spin && '[animation:spin_700ms_cubic-bezier(0.22,1,0.36,1)]')}
        />
      </button>
      <span className="w-px self-stretch bg-border" aria-hidden="true" />
      <span className="inline-flex items-center px-2 text-sm tabular-nums">{selected.selectedLabel}</span>
      <span className="w-px self-stretch bg-border" aria-hidden="true" />
      <DropdownMenu>
        <DropdownMenuTrigger
          aria-label="Auto refresh interval"
          className={cn(
            'inline-flex items-center rounded-r-[5px] px-1.5 outline-none transition-colors',
            'hover:bg-accent/40 dark:hover:bg-input/50',
            'data-[state=open]:bg-accent/40',
          )}
        >
          <IconChevronDown className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-40">
          <DropdownMenuRadioGroup value={value} onValueChange={(v) => onChange(v as AutoRefreshInterval)}>
            {options.map((key) => (
              <DropdownMenuRadioItem key={key} value={key}>
                {AUTO_REFRESH_INTERVALS[key].label}
              </DropdownMenuRadioItem>
            ))}
          </DropdownMenuRadioGroup>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  )
}
