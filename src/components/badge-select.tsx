import { CheckIcon, ChevronDownIcon } from '@heroicons/react/16/solid'
import { Dropdown, DropdownButton, DropdownItem, DropdownLabel, DropdownMenu } from '#/components/ui/catalyst/dropdown'

interface BadgeSelectProps<T extends string> {
  label: string
  value: T
  options: readonly T[]
  onChange: (value: T) => void
  /** Display string for the badge + menu rows. Defaults to the raw value. */
  format?: (value: T) => string
}

export function BadgeSelect<T extends string>({ label, value, options, onChange, format }: BadgeSelectProps<T>) {
  const display = format ?? ((v: T) => v)
  return (
    <Dropdown>
      <DropdownButton as="button" className={triggerClass}>
        <span className="text-sm text-zinc-700 dark:text-zinc-300">{label}</span>
        <ChevronDownIcon data-slot="icon" className="size-4 fill-zinc-500 opacity-60 dark:fill-zinc-400" />
        <span className="mx-1 h-4 w-px shrink-0 bg-zinc-950/10 dark:bg-white/10" aria-hidden />
        <span className={badgeClass}>{display(value)}</span>
      </DropdownButton>
      <DropdownMenu anchor="bottom end" className="min-w-44">
        {options.map((option) => (
          <DropdownItem key={option} onClick={() => onChange(option)}>
            {value === option ? <CheckIcon data-slot="icon" /> : <span data-slot="icon" />}
            <DropdownLabel>{display(option)}</DropdownLabel>
          </DropdownItem>
        ))}
      </DropdownMenu>
    </Dropdown>
  )
}

const triggerClass =
  'inline-flex h-8 shrink-0 cursor-pointer items-center gap-1.5 rounded-md border border-zinc-950/10 bg-white px-2.5 font-medium whitespace-nowrap text-zinc-950 shadow-xs transition-colors hover:bg-zinc-950/[0.03] focus:outline-hidden focus-visible:ring-2 focus-visible:ring-focus-500/80 disabled:cursor-not-allowed disabled:opacity-50 dark:border-white/10 dark:bg-white/[0.03] dark:text-zinc-100 dark:shadow-none dark:hover:bg-white/[0.07]'

const badgeClass =
  'rounded-sm bg-zinc-950/[0.06] px-1.5 py-0.5 text-xs font-normal text-zinc-700 dark:bg-white/[0.08] dark:text-zinc-300'
