import { Refresh01Icon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { useState } from 'react'
import { Button } from '#/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '#/components/ui/select'
import { Separator } from '#/components/ui/separator'
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
  onRefresh?: () => void
  /** Disables the refresh button while a fetch is in flight (no animation). */
  loading?: boolean
}

const SPIN_MS = 700

export function AutoRefreshSelect({ value, onChange, onRefresh, loading = false }: AutoRefreshSelectProps) {
  const selected = AUTO_REFRESH_OPTIONS.find((option) => option.value === value) ?? AUTO_REFRESH_OPTIONS[0]
  // Animate the refresh icon only on manual click — silent for background polls.
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
          {AUTO_REFRESH_OPTIONS.map((option) => (
            <SelectItem key={option.value} value={option.value}>
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  )
}
