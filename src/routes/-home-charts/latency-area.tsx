import { useQuery } from '@tanstack/react-query'
import { Area, Bar, CartesianGrid, ComposedChart, XAxis, YAxis } from 'recharts'
import { type ChartConfig, ChartContainer, ChartTooltip, ChartTooltipContent } from '#/components/ui/chart'
import { Skeleton } from '#/components/ui/skeleton'
import { formatDuration } from '#/lib/format'
import type { LatencyPoint } from '#/lib/telemetry'
import { formatChartTick, type TimeRange } from '#/lib/time-range'
import { chatLatencyOverTimeQuery } from '../-home-data'
import { HomeChartCard } from './chart-card'

const CHART_CONFIG: ChartConfig = {
  p95Ms: { label: 'p95 latency', color: 'var(--primary)' },
  p50Ms: { label: 'p50 latency', color: 'var(--muted-foreground)' },
  count: { label: 'LLM calls', color: 'var(--muted)' },
}

export function LatencyAreaChart() {
  return (
    <HomeChartCard title="Chat latency over time" wide>
      {(range) => <LatencyChart range={range} />}
    </HomeChartCard>
  )
}

function LatencyChart({ range }: { range: TimeRange }) {
  const { data = [], isPending } = useQuery(chatLatencyOverTimeQuery(range))
  if (isPending) return <Skeleton className="h-[240px] w-full" />
  return <LatencyChartInner data={data} range={range} />
}

function LatencyChartInner({ data, range }: { data: LatencyPoint[]; range: TimeRange }) {
  if (data.length === 0 || data.every((d) => d.count === 0)) {
    return <div className="text-xs text-muted-foreground">No chat spans in this window.</div>
  }
  return (
    <ChartContainer config={CHART_CONFIG} className="aspect-auto h-[240px] w-full">
      <ComposedChart data={data} margin={{ top: 8, right: 12, bottom: 0, left: 0 }}>
        <defs>
          <linearGradient id="latency-area-fill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--color-p95Ms)" stopOpacity={0.4} />
            <stop offset="100%" stopColor="var(--color-p95Ms)" stopOpacity={0} />
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
          yAxisId="ms"
          tickLine={false}
          axisLine={false}
          width={56}
          tickFormatter={(v: number) => formatDuration(v)}
        />
        <YAxis yAxisId="count" orientation="right" tickLine={false} axisLine={false} width={32} allowDecimals={false} />
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
              formatter={(value, name) => {
                const n = Number(value)
                const isLatency = typeof name === 'string' && name.startsWith('p')
                return (
                  <span className="flex w-full items-center gap-2">
                    <span className="text-muted-foreground">{name}</span>
                    <span className="ml-auto font-mono font-medium tabular-nums">
                      {isLatency ? formatDuration(n) : n.toLocaleString()}
                    </span>
                  </span>
                )
              }}
            />
          }
        />
        <Bar yAxisId="count" dataKey="count" fill="var(--color-count)" fillOpacity={0.4} isAnimationActive={false} />
        <Area
          yAxisId="ms"
          dataKey="p95Ms"
          type="monotone"
          fill="url(#latency-area-fill)"
          stroke="var(--color-p95Ms)"
          strokeWidth={2}
          isAnimationActive={false}
        />
        <Area
          yAxisId="ms"
          dataKey="p50Ms"
          type="monotone"
          fill="transparent"
          stroke="var(--color-p50Ms)"
          strokeWidth={1.5}
          strokeDasharray="3 3"
          isAnimationActive={false}
        />
      </ComposedChart>
    </ChartContainer>
  )
}
