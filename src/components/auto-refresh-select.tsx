import { Refresh01Icon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { useState } from 'react'
import { Button } from '#/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '#/components/ui/select'
import { Separator } from '#/components/ui/separator'
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
  /** Disables the refresh button while a fetch is in flight (no animation). */
  loading?: boolean
  /** Available interval options. Defaults to the sessions-list set. */
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
  // Animate the refresh icon only on manual click — background polls are surfaced via <RefreshingIndicator />.
  const [spin, setSpin] = useState(false)
  const handleClick = () => {
    if (!onRefresh) return
    setSpin(true)
    onRefresh()
    window.setTimeout(() => setSpin(false), SPIN_MS)
  }

  return (
    <div className="inline-flex items-center gap-1">
      {onRefresh && (
        <Button
          type="button"
          aria-label="Refresh now"
          variant="outline"
          size="icon-sm"
          onClick={handleClick}
          disabled={loading}
        >
          <HugeiconsIcon
            icon={Refresh01Icon}
            className={cn(spin && '[animation:spin_700ms_cubic-bezier(0.22,1,0.36,1)]')}
          />
        </Button>
      )}
      <Select value={value} onValueChange={(v) => onChange(v as AutoRefreshInterval)}>
        <SelectTrigger size="sm" aria-label="Auto refresh" className="border-border bg-transparent">
          <span className="text-muted-foreground">Auto</span>
          <Separator orientation="vertical" className="data-[orientation=vertical]:h-3.5" />
          <SelectValue>
            <span className="tabular-nums">{selected.selectedLabel}</span>
          </SelectValue>
        </SelectTrigger>
        <SelectContent position="popper" align="end">
          {options.map((key) => (
            <SelectItem key={key} value={key}>
              {AUTO_REFRESH_INTERVALS[key].label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  )
}
