import type { LucideIcon } from 'lucide-react'
import { Tabs, TabsList, TabsTrigger } from '#/components/ui/tabs'

interface IconTab<T extends string> {
  id: T
  label: string
  icon: LucideIcon
}

interface IconTabsProps<T extends string> {
  tabs: readonly IconTab<T>[]
  value: T
  onChange: (value: T) => void
  'aria-label': string
  className?: string
  variant?: 'default' | 'line'
}

export function IconTabs<T extends string>({
  tabs,
  value,
  onChange,
  'aria-label': ariaLabel,
  className,
  variant = 'default',
}: IconTabsProps<T>) {
  return (
    <Tabs value={value} onValueChange={(v) => onChange(v as T)} className={className}>
      <TabsList aria-label={ariaLabel} variant={variant}>
        {tabs.map(({ id, label, icon: Icon }) => (
          <TabsTrigger key={id} value={id}>
            <Icon aria-hidden />
            {label}
          </TabsTrigger>
        ))}
      </TabsList>
    </Tabs>
  )
}
