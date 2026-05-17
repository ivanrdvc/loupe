import { Tick02Icon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { Button } from '#/components/ui/button'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '#/components/ui/dropdown-menu'
import { Separator } from '#/components/ui/separator'

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
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm">
          <span className="text-muted-foreground">{label}</span>
          <Separator orientation="vertical" className="mx-1 h-4" />
          <span className="rounded bg-muted px-1.5 py-0.5 text-[11px] font-medium text-foreground">
            {display(value)}
          </span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-44">
        {options.map((option) => (
          <DropdownMenuItem key={option} onSelect={() => onChange(option)}>
            <HugeiconsIcon icon={Tick02Icon} className={value === option ? 'opacity-100' : 'opacity-0'} />
            {display(option)}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
