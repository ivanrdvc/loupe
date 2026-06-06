import { useQuery } from '@tanstack/react-query'
import { Area, AreaChart, CartesianGrid, XAxis, YAxis } from 'recharts'
import { type ChartConfig, ChartContainer, ChartTooltip, ChartTooltipContent } from '#/components/ui/chart'
import { Skeleton } from '#/components/ui/skeleton'
import type { CacheHitPoint } from '#/lib/telemetry'
import { formatChartTick, type TimeRange } from '#/lib/time-range'
import { cacheHitRateOverTimeQuery } from '../-home-data'
import { HomeChartCard } from './chart-card'

const CHART_CONFIG: ChartConfig = {
  ratio: { label: 'Cache hit', color: 'var(--primary)' },
}

export function CacheAreaChart() {
  return <HomeChartCard title="Cache-hit rate over time">{(range) => <CacheChart range={range} />}</HomeChartCard>
}

function CacheChart({ range }: { range: TimeRange }) {
  const { data = [], isPending } = useQuery(cacheHitRateOverTimeQuery(range))
  if (isPending) return <Skeleton className="h-[200px] w-full" />
  return <CacheChartInner data={data} range={range} />
}

function CacheChartInner({ data, range }: { data: CacheHitPoint[]; range: TimeRange }) {
  if (data.length === 0 || data.every((d) => d.inputTokens === 0)) {
    return <div className="text-xs text-muted-foreground">No chat spans in this window.</div>
  }
  return (
    <ChartContainer config={CHART_CONFIG} className="aspect-auto h-[200px] w-full">
      <AreaChart data={data} margin={{ top: 8, right: 12, bottom: 0, left: 0 }}>
        <defs>
          <linearGradient id="cache-area-fill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--color-ratio)" stopOpacity={0.4} />
            <stop offset="100%" stopColor="var(--color-ratio)" stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid vertical={false} />
        <XAxis
          dataKey="ts"
          tickLine={false}
          axisLine={false}
          tickMargin={8}
          minTickGap={32}
          tickFormatter={(v: number) => formatChartTick(v, range)}
        />
        <YAxis
          tickLine={false}
          axisLine={false}
          width={40}
          domain={[0, 1]}
          tickFormatter={(v: number) => `${Math.round(v * 100)}%`}
        />
        <ChartTooltip
          cursor={false}
          content={
            <ChartTooltipContent
              labelFormatter={(_, payload) => {
                const ts = payload?.[0]?.payload?.ts
                return typeof ts === 'number'
                  ? new Date(ts).toLocaleString('en-US', { dateStyle: 'short', timeStyle: 'short' })
                  : ''
              }}
              formatter={(value, name) => (
                <span className="flex w-full items-center gap-2">
                  <span className="text-muted-foreground">{name}</span>
                  <span className="ml-auto font-mono font-medium tabular-nums">
                    {(Number(value) * 100).toFixed(1)}%
                  </span>
                </span>
              )}
            />
          }
        />
        <Area
          dataKey="ratio"
          type="monotone"
          fill="url(#cache-area-fill)"
          stroke="var(--color-ratio)"
          strokeWidth={2}
          isAnimationActive={false}
        />
      </AreaChart>
    </ChartContainer>
  )
}
