import { IconTrendingDown, IconTrendingUp } from '@tabler/icons-react'

import { Badge } from '#/components/ui/badge'
import { Card, CardAction, CardDescription, CardFooter, CardHeader, CardTitle } from '#/components/ui/card'
import { formatDuration, formatPercent } from '#/lib/format'
import type { OverviewAggregate } from '#/lib/telemetry'

export interface SectionCardsProps {
  current: OverviewAggregate
  prior: OverviewAggregate
}

type Tone = 'up-good' | 'up-bad' | 'down-good' | 'down-bad' | 'flat'

function pctDelta(current: number, prior: number): number | undefined {
  if (!prior) return current > 0 ? Number.POSITIVE_INFINITY : undefined
  return ((current - prior) / prior) * 100
}

function fmtDelta(delta: number | undefined): string {
  if (delta === undefined) return 'no prior data'
  if (!Number.isFinite(delta)) return 'new'
  const sign = delta > 0 ? '+' : ''
  return `${sign}${delta.toFixed(1)}%`
}

function tone(delta: number | undefined, betterDirection: 'up' | 'down'): Tone {
  if (delta === undefined || delta === 0) return 'flat'
  if (!Number.isFinite(delta)) return betterDirection === 'up' ? 'up-good' : 'up-bad'
  if (delta > 0) return betterDirection === 'up' ? 'up-good' : 'up-bad'
  return betterDirection === 'up' ? 'down-bad' : 'down-good'
}

function DeltaBadge({ delta, t }: { delta: number | undefined; t: Tone }) {
  const Icon = t === 'up-good' || t === 'up-bad' ? IconTrendingUp : IconTrendingDown
  return (
    <Badge variant="outline">
      {t !== 'flat' && <Icon />}
      {fmtDelta(delta)}
    </Badge>
  )
}

function toneCopy(t: Tone, up: string, down: string, flat: string): string {
  if (t === 'flat') return flat
  if (t === 'up-good' || t === 'up-bad') return up
  return down
}

export function SectionCards({ current, prior }: SectionCardsProps) {
  const runsDelta = pctDelta(current.runs, prior.runs)
  const runsTone = tone(runsDelta, 'up')

  const errorRate = current.runs > 0 ? current.erroredRuns / current.runs : 0
  const priorErrorRate = prior.runs > 0 ? prior.erroredRuns / prior.runs : 0
  const errorDelta = pctDelta(errorRate, priorErrorRate)
  const errorTone = tone(errorDelta, 'down')

  const latencyDelta = pctDelta(current.p95ChatMs, prior.p95ChatMs)
  const latencyTone = tone(latencyDelta, 'down')

  const costDelta = pctDelta(current.totalCostUsd, prior.totalCostUsd)
  const costTone = tone(costDelta, 'down')

  return (
    <div className="*:data-[slot=card]:from-primary/5 *:data-[slot=card]:to-card grid grid-cols-1 gap-4 px-4 *:data-[slot=card]:bg-gradient-to-t *:data-[slot=card]:shadow-xs lg:px-6 @xl/main:grid-cols-2 @5xl/main:grid-cols-4 dark:*:data-[slot=card]:bg-card">
      <Card className="@container/card">
        <CardHeader>
          <CardDescription>Runs</CardDescription>
          <CardTitle className="text-2xl font-semibold tabular-nums @[250px]/card:text-3xl">
            {current.runs.toLocaleString()}
          </CardTitle>
          <CardAction>
            <DeltaBadge delta={runsDelta} t={runsTone} />
          </CardAction>
        </CardHeader>
        <CardFooter className="flex-col items-start gap-1.5 text-sm">
          <div className="line-clamp-1 flex gap-2 font-medium">
            {toneCopy(
              runsTone,
              'More activity vs. prior window',
              'Fewer runs vs. prior window',
              'Flat vs. prior window',
            )}
          </div>
          <div className="text-muted-foreground">Distinct traces in window</div>
        </CardFooter>
      </Card>

      <Card className="@container/card">
        <CardHeader>
          <CardDescription>Error rate</CardDescription>
          <CardTitle className="text-2xl font-semibold tabular-nums @[250px]/card:text-3xl">
            {current.runs > 0 ? formatPercent(current.erroredRuns, current.runs) : '—'}
          </CardTitle>
          <CardAction>
            <DeltaBadge delta={errorDelta} t={errorTone} />
          </CardAction>
        </CardHeader>
        <CardFooter className="flex-col items-start gap-1.5 text-sm">
          <div className="line-clamp-1 flex gap-2 font-medium">
            {toneCopy(errorTone, 'Failures climbing', 'Failures easing', 'Stable failure rate')}
          </div>
          <div className="text-muted-foreground">
            {current.erroredRuns} of {current.runs} runs hit an error span
          </div>
        </CardFooter>
      </Card>

      <Card className="@container/card">
        <CardHeader>
          <CardDescription>p95 chat latency</CardDescription>
          <CardTitle className="text-2xl font-semibold tabular-nums @[250px]/card:text-3xl">
            {current.p95ChatMs > 0 ? formatDuration(current.p95ChatMs) : '—'}
          </CardTitle>
          <CardAction>
            <DeltaBadge delta={latencyDelta} t={latencyTone} />
          </CardAction>
        </CardHeader>
        <CardFooter className="flex-col items-start gap-1.5 text-sm">
          <div className="line-clamp-1 flex gap-2 font-medium">
            {toneCopy(latencyTone, 'Tail getting slower', 'Tail getting faster', 'Tail steady')}
          </div>
          <div className="text-muted-foreground">95th percentile across LLM chat spans</div>
        </CardFooter>
      </Card>

      <Card className="@container/card">
        <CardHeader>
          <CardDescription>Cost</CardDescription>
          <CardTitle className="text-2xl font-semibold tabular-nums @[250px]/card:text-3xl">
            {current.totalCostUsd > 0 ? `$${current.totalCostUsd.toFixed(2)}` : '—'}
          </CardTitle>
          <CardAction>
            <DeltaBadge delta={costDelta} t={costTone} />
          </CardAction>
        </CardHeader>
        <CardFooter className="flex-col items-start gap-1.5 text-sm">
          <div className="line-clamp-1 flex gap-2 font-medium">
            {toneCopy(costTone, 'Spend rising', 'Spend falling', 'Spend flat')}
          </div>
          <div className="text-muted-foreground">USD across chat spans in window</div>
        </CardFooter>
      </Card>
    </div>
  )
}
