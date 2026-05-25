import { useQuery } from '@tanstack/react-query'
import { Area, AreaChart, CartesianGrid, XAxis, YAxis } from 'recharts'
import { type ChartConfig, ChartContainer, ChartTooltip, ChartTooltipContent } from '#/components/ui/chart'
import type { RunsPoint } from '#/lib/telemetry'
import { formatChartTick, type TimeRange } from '#/lib/time-range'
import { runsPerHourQuery } from '../-home-data'
import { HomeChartCard } from './chart-card'

const CHART_CONFIG: ChartConfig = {
  runs: { label: 'Runs', color: 'var(--primary)' },
}

export function ThroughputAreaChart() {
  return <HomeChartCard title="Runs over time">{(range) => <ThroughputChart range={range} />}</HomeChartCard>
}

function ThroughputChart({ range }: { range: TimeRange }) {
  const { data = [] } = useQuery(runsPerHourQuery(range))
  return <ThroughputChartInner data={data} range={range} />
}

function ThroughputChartInner({ data, range }: { data: RunsPoint[]; range: TimeRange }) {
  if (data.length === 0 || data.every((d) => d.runs === 0)) {
    return <div className="text-xs text-muted-foreground">No runs in this window.</div>
  }
  return (
    <ChartContainer config={CHART_CONFIG} className="aspect-auto h-[200px] w-full">
      <AreaChart data={data} margin={{ top: 8, right: 12, bottom: 0, left: 0 }}>
        <defs>
          <linearGradient id="throughput-area-fill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--color-runs)" stopOpacity={0.5} />
            <stop offset="100%" stopColor="var(--color-runs)" stopOpacity={0} />
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
        <YAxis tickLine={false} axisLine={false} width={32} allowDecimals={false} />
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
            />
          }
        />
        <Area
          dataKey="runs"
          type="monotone"
          fill="url(#throughput-area-fill)"
          stroke="var(--color-runs)"
          strokeWidth={2}
          isAnimationActive={false}
        />
      </AreaChart>
    </ChartContainer>
  )
}
