import { useQuery } from '@tanstack/react-query'
import { Area, AreaChart } from 'recharts'
import { type ChartConfig, ChartContainer, ChartTooltip, ChartTooltipContent } from '#/components/ui/chart'
import { useTimeRange } from '#/hooks/use-time-range'
import { formatTokens } from '#/lib/format'
import { formatChartTick } from '#/lib/time-range'
import { classifyPayloadTrend, type TrendDirection } from '../logic/payload-trend'
import { toolPayloadTrendQuery } from './tool-data'

const CHART_CONFIG: ChartConfig = {
  p95Tokens: { label: 'p95 result', color: 'var(--primary)' },
}

const SHAPE: Record<TrendDirection, { label: string; tone: string }> = {
  growing: { label: 'Scales with data', tone: 'text-warning' },
  flat: { label: 'Bounded', tone: 'text-muted-foreground' },
  shrinking: { label: 'Shrinking', tone: 'text-muted-foreground' },
}

export function ToolPayloadTrend({ name, open }: { name: string; open: boolean }) {
  const [range] = useTimeRange()
  const { data = [], isPending } = useQuery({ ...toolPayloadTrendQuery(name, range), enabled: open })
  if (isPending || data.length === 0 || data.every((d) => d.calls === 0)) return null

  const trend = classifyPayloadTrend(data)
  const shape = SHAPE[trend.direction]
  return (
    <section className="border-b px-4 py-4">
      <div className="mb-2 flex items-center justify-between">
        <h3 className="text-xs font-medium text-muted-foreground">Result size over time</h3>
        <span className={`text-xs font-medium ${shape.tone}`}>
          {shape.label}
          {trend.direction === 'growing' && ` · ${trend.ratio.toFixed(1)}×`}
        </span>
      </div>
      <ChartContainer config={CHART_CONFIG} className="aspect-auto h-[96px] w-full">
        <AreaChart data={data} margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
          <defs>
            <linearGradient id="tool-trend-fill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--color-p95Tokens)" stopOpacity={0.4} />
              <stop offset="100%" stopColor="var(--color-p95Tokens)" stopOpacity={0} />
            </linearGradient>
          </defs>
          <ChartTooltip
            cursor={false}
            content={
              <ChartTooltipContent
                labelFormatter={(_, payload) => formatChartTick(Number(payload?.[0]?.payload?.ts ?? 0), range)}
                formatter={(value) => `${formatTokens(Number(value))} tok`}
              />
            }
          />
          <Area
            dataKey="p95Tokens"
            type="monotone"
            fill="url(#tool-trend-fill)"
            stroke="var(--color-p95Tokens)"
            strokeWidth={2}
            isAnimationActive={false}
          />
        </AreaChart>
      </ChartContainer>
    </section>
  )
}
