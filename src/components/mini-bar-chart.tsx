import { Bar, BarChart } from 'recharts'
import type { ToolBucketPoint } from '#/lib/telemetry'

export interface MiniBarChartProps {
  data: ToolBucketPoint[]
  width?: number
  height?: number
  tone?: 'destructive' | 'warning' | 'primary'
}

const TONE_COLOR: Record<NonNullable<MiniBarChartProps['tone']>, string> = {
  destructive: 'var(--destructive)',
  warning: 'oklch(0.795 0.184 86.047)',
  primary: 'var(--primary)',
}

export function MiniBarChart({ data, width = 80, height = 24, tone = 'primary' }: MiniBarChartProps) {
  if (data.length === 0 || data.every((d) => d.value <= 0)) {
    return (
      <span
        style={{ width, height }}
        className="inline-block text-center text-[10px] leading-[24px] text-muted-foreground/60"
      >
        —
      </span>
    )
  }
  return (
    <BarChart width={width} height={height} data={data} margin={{ top: 0, right: 0, bottom: 0, left: 0 }}>
      <Bar dataKey="value" fill={TONE_COLOR[tone]} radius={[1, 1, 0, 0]} isAnimationActive={false} />
    </BarChart>
  )
}
