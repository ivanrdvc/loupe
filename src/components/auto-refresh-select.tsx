import { CheckIcon, ChevronDownIcon } from '@heroicons/react/16/solid'
import { ArrowPathIcon } from '@heroicons/react/20/solid'
import { Dropdown, DropdownButton, DropdownItem, DropdownLabel, DropdownMenu } from '#/components/ui/catalyst/dropdown'

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
    <div className="inline-flex h-8 overflow-hidden rounded-md border border-zinc-950/10 bg-white text-sm/5 font-medium text-zinc-950 shadow-xs transition-colors dark:border-white/10 dark:bg-white/[0.03] dark:text-zinc-100 dark:shadow-none">
      <button
        type="button"
        aria-label="Refresh now"
        onClick={onRefresh}
        disabled={loading}
        className="inline-flex w-9 cursor-pointer items-center justify-center border-r border-zinc-950/10 transition-colors hover:bg-zinc-950/[0.03] focus:outline-hidden focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-focus-500/80 disabled:cursor-wait disabled:hover:bg-transparent dark:border-white/10 dark:hover:bg-white/[0.07]"
      >
        <ArrowPathIcon
          className={[
            'size-4 origin-center fill-zinc-500 transition-colors dark:fill-zinc-400',
            loading ? 'fill-zinc-950 [animation:spin_700ms_cubic-bezier(0.22,1,0.36,1)] dark:fill-zinc-100' : '',
          ].join(' ')}
        />
      </button>
      <Dropdown>
        <DropdownButton
          as="button"
          className="inline-flex h-full cursor-pointer items-center gap-2 px-3 whitespace-nowrap transition-colors hover:bg-zinc-950/[0.03] focus:outline-hidden focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-focus-500/80 dark:hover:bg-white/[0.07]"
        >
          <span>{selected.selectedLabel}</span>
          <ChevronDownIcon data-slot="icon" className="size-4 fill-zinc-500 opacity-60 dark:fill-zinc-400" />
        </DropdownButton>
        <DropdownMenu anchor="bottom end" className="z-[60] min-w-40">
          {AUTO_REFRESH_OPTIONS.map((option) => (
            <DropdownItem key={option.value} onClick={() => onChange(option.value)} className={controlMenuItemClass}>
              {value === option.value ? <CheckIcon data-slot="icon" /> : <span data-slot="icon" />}
              <DropdownLabel>{option.label}</DropdownLabel>
            </DropdownItem>
          ))}
        </DropdownMenu>
      </Dropdown>
    </div>
  )
}

const controlMenuItemClass =
  '!cursor-pointer data-focus:!bg-zinc-100 data-focus:!text-zinc-950 dark:data-focus:!bg-white/10 dark:data-focus:!text-white dark:data-focus:*:data-[slot=icon]:!text-zinc-300'
