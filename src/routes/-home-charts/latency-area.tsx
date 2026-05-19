import { Area, AreaChart, CartesianGrid, XAxis, YAxis } from 'recharts'
import { type ChartConfig, ChartContainer, ChartTooltip, ChartTooltipContent } from '#/components/ui/chart'
import { formatDuration } from '#/lib/format'
import type { LatencyPoint } from '#/lib/telemetry'

const CHART_CONFIG: ChartConfig = {
  p95Ms: { label: 'p95', color: 'var(--primary)' },
}

export function LatencyAreaChart({ data }: { data: LatencyPoint[] }) {
  if (data.length === 0) {
    return <div className="text-xs text-muted-foreground">No chat spans in this window.</div>
  }
  return (
    <ChartContainer config={CHART_CONFIG} className="aspect-auto h-[200px] w-full">
      <AreaChart data={data} margin={{ top: 8, right: 12, bottom: 0, left: 0 }}>
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
          tickFormatter={(v: number) => new Date(v).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}
        />
        <YAxis tickLine={false} axisLine={false} width={48} tickFormatter={(v: number) => formatDuration(v)} />
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
                  <span className="ml-auto font-mono font-medium tabular-nums">{formatDuration(Number(value))}</span>
                </span>
              )}
            />
          }
        />
        <Area
          dataKey="p95Ms"
          type="monotone"
          fill="url(#latency-area-fill)"
          stroke="var(--color-p95Ms)"
          strokeWidth={2}
          isAnimationActive={false}
        />
      </AreaChart>
    </ChartContainer>
  )
}
