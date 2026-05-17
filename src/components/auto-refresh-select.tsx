import { Refresh01Icon, Tick02Icon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { Button } from '#/components/ui/button'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '#/components/ui/dropdown-menu'
import { cn } from '#/lib/utils'

export const AUTO_REFRESH_OPTIONS = [
  { value: 'off', label: 'Off', selectedLabel: 'Off' },
  { value: '30s', label: 'Every 30s', selectedLabel: '30s' },
  { value: '1m', label: 'Every 1 min', selectedLabel: '1m' },
  { value: '5m', label: 'Every 5 min', selectedLabel: '5m' },
  { value: '15m', label: 'Every 15 min', selectedLabel: '15m' },
] as const

export type AutoRefreshInterval = (typeof AUTO_REFRESH_OPTIONS)[number]['value']
export const DEFAULT_AUTO_REFRESH_INTERVAL: AutoRefreshInterval = '30s'
export const AUTO_REFRESH_MS: Record<AutoRefreshInterval, false | number> = {
  off: false,
  '30s': 30_000,
  '1m': 60_000,
  '5m': 5 * 60_000,
  '15m': 15 * 60_000,
}

interface AutoRefreshSelectProps {
  value: AutoRefreshInterval
  onChange: (value: AutoRefreshInterval) => void
  onRefresh: () => void
  loading?: boolean
}

export function AutoRefreshSelect({ value, onChange, onRefresh, loading = false }: AutoRefreshSelectProps) {
  const selected = AUTO_REFRESH_OPTIONS.find((option) => option.value === value) ?? AUTO_REFRESH_OPTIONS[0]

  return (
    <div className="inline-flex items-center gap-1">
      <Button
        type="button"
        aria-label="Refresh now"
        variant="outline"
        size="icon-sm"
        onClick={onRefresh}
        disabled={loading}
      >
        <HugeiconsIcon
          icon={Refresh01Icon}
          className={cn(loading && '[animation:spin_700ms_cubic-bezier(0.22,1,0.36,1)]')}
        />
      </Button>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" size="sm">
            {selected.selectedLabel}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="min-w-40">
          {AUTO_REFRESH_OPTIONS.map((option) => (
            <DropdownMenuItem key={option.value} onSelect={() => onChange(option.value)}>
              <HugeiconsIcon icon={Tick02Icon} className={value === option.value ? 'opacity-100' : 'opacity-0'} />
              {option.label}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  )
}
