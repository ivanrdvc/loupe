interface Option<T extends string> {
  value: T
  label: string
  disabled?: boolean
  title?: string
}

interface StatusPillsProps<T extends string> {
  value: T
  onChange: (v: T) => void
  options: Option<T>[]
}

export function StatusPills<T extends string>({ value, onChange, options }: StatusPillsProps<T>) {
  return (
    <div className="inline-flex h-8 rounded-md border bg-background p-px text-xs shadow-xs dark:bg-input/30 dark:shadow-none">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          onClick={() => !o.disabled && onChange(o.value)}
          disabled={o.disabled}
          title={o.title}
          className={[
            'h-7 rounded px-2.5 font-medium whitespace-nowrap transition-colors',
            o.disabled
              ? 'cursor-not-allowed text-muted-foreground/60'
              : value === o.value
                ? 'cursor-pointer bg-accent text-accent-foreground'
                : 'cursor-pointer text-muted-foreground hover:bg-accent/50 hover:text-foreground',
          ].join(' ')}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}
