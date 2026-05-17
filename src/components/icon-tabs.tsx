import type { ComponentType } from 'react'
import { Tabs, TabsList, TabsTrigger } from '#/components/ui/tabs'

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
    <Tabs value={value} onValueChange={(v) => onChange(v as T)} className={className}>
      <TabsList aria-label={ariaLabel}>
        {tabs.map(({ id, label, Icon }) => (
          <TabsTrigger key={id} value={id}>
            <Icon aria-hidden />
            {label}
          </TabsTrigger>
        ))}
      </TabsList>
    </Tabs>
  )
}
