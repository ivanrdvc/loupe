import type { ComponentType } from 'react'

export interface IconTab<T extends string> {
  id: T
  label: string
  Icon: ComponentType<{ className?: string; 'aria-hidden'?: boolean }>
}

interface IconTabsProps<T extends string> {
  tabs: readonly IconTab<T>[]
  value: T
  onChange: (value: T) => void
  'aria-label': string
  className?: string
}

export function IconTabs<T extends string>({
  tabs,
  value,
  onChange,
  'aria-label': ariaLabel,
  className,
}: IconTabsProps<T>) {
  return (
    <nav
      className={['-ml-0.5 flex flex-wrap items-center gap-1', className].filter(Boolean).join(' ')}
      aria-label={ariaLabel}
    >
      {tabs.map(({ id, label, Icon }) => (
        <button
          key={id}
          type="button"
          onClick={() => onChange(id)}
          className={[
            'inline-flex h-7 cursor-pointer items-center gap-1.5 rounded-md px-2 text-xs font-medium transition-colors',
            value === id
              ? 'bg-accent text-accent-foreground ring-1 ring-border'
              : 'text-muted-foreground hover:bg-accent/50 hover:text-foreground',
          ].join(' ')}
        >
          <Icon className="size-3.5 shrink-0" aria-hidden />
          {label}
        </button>
      ))}
    </nav>
  )
}
