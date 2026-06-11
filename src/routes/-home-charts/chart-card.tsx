import { useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '#/components/ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '#/components/ui/select'
import type { TimeRange } from '#/lib/time-range'

export const HOME_CHART_RANGES: { value: number; label: string }[] = [
  { value: 1, label: 'Last 1 day' },
  { value: 7, label: 'Last 7 days' },
  { value: 14, label: 'Last 14 days' },
  { value: 30, label: 'Last 30 days' },
]

interface HomeChartCardProps {
  title: string
  wide?: boolean
  defaultRange?: number
  children: (range: TimeRange) => React.ReactNode
}

export function HomeChartCard({ title, wide, defaultRange = 7, children }: HomeChartCardProps) {
  const [range, setRange] = useState<number>(defaultRange)
  return (
    <Card className={`gap-0 pt-0 ${wide ? 'xl:col-span-2' : ''}`}>
      <CardHeader className="flex items-center gap-2 space-y-0 border-b py-5 sm:flex-row">
        <CardTitle className="flex-1 text-base font-semibold">{title}</CardTitle>
        <Select value={String(range)} onValueChange={(v) => setRange(Number(v))}>
          <SelectTrigger size="sm" aria-label="Range" className="w-[140px] border-border bg-transparent text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent align="end">
            {HOME_CHART_RANGES.map((r) => (
              <SelectItem key={r.value} value={String(r.value)}>
                {r.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </CardHeader>
      <CardContent className="px-2 pt-4 sm:px-4 sm:pt-6">{children(range as TimeRange)}</CardContent>
    </Card>
  )
}
