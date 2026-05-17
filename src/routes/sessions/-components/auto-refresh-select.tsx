import { IconCheck, IconChevronDown, IconRefresh } from '@tabler/icons-react'
import { useEffect, useState } from 'react'
import {
  AUTO_REFRESH_OPTIONS,
  type AutoRefreshInterval,
  DEFAULT_AUTO_REFRESH_INTERVAL,
} from '#/components/auto-refresh-select'
import { Button } from '#/components/ui/button'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '#/components/ui/dropdown-menu'
import { Separator } from '#/components/ui/separator'
import { cn } from '#/lib/utils'

const STORAGE_KEY = 'sessions-2-auto-refresh'

function isInterval(v: unknown): v is AutoRefreshInterval {
  return typeof v === 'string' && AUTO_REFRESH_OPTIONS.some((o) => o.value === v)
}

function useAutoRefresh(): [AutoRefreshInterval, (next: AutoRefreshInterval) => void] {
  const [interval, setState] = useState<AutoRefreshInterval>(DEFAULT_AUTO_REFRESH_INTERVAL)
  useEffect(() => {
    const stored = window.localStorage.getItem(STORAGE_KEY)
    if (isInterval(stored)) setState(stored)
  }, [])
  const setInterval = (next: AutoRefreshInterval) => {
    setState(next)
    window.localStorage.setItem(STORAGE_KEY, next)
  }
  return [interval, setInterval]
}

interface AutoRefreshSelectProps {
  onRefresh?: () => void
  loading?: boolean
}

export function AutoRefreshSelect({ onRefresh, loading = false }: AutoRefreshSelectProps = {}) {
  const [interval, setInterval] = useAutoRefresh()
  const selected = AUTO_REFRESH_OPTIONS.find((o) => o.value === interval) ?? AUTO_REFRESH_OPTIONS[0]

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
        <IconRefresh className={cn(loading && 'animate-spin')} />
      </Button>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" size="sm">
            <span className="text-muted-foreground">Auto</span>
            <Separator orientation="vertical" className="mx-2 data-[orientation=vertical]:h-4" />
            <span className="tabular-nums">{selected.selectedLabel}</span>
            <IconChevronDown />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="min-w-40">
          {AUTO_REFRESH_OPTIONS.map((option) => (
            <DropdownMenuItem key={option.value} onSelect={() => setInterval(option.value)}>
              <IconCheck className={interval === option.value ? 'opacity-100' : 'opacity-0'} />
              {option.label}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  )
}
