import { queryOptions, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { createFileRoute, Link } from '@tanstack/react-router'
import { Plus, TestTube } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'
import { Page } from '#/components/page'
import { RelativeTime } from '#/components/relative-time'
import { StatusDot } from '#/components/status-dot'
import { Button } from '#/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '#/components/ui/card'
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '#/components/ui/empty'
import { ProgressCircle } from '#/components/ui/progress-circle'
import { Skeleton } from '#/components/ui/skeleton'
import { Switch } from '#/components/ui/switch'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '#/components/ui/table'
import { definitionsQuery, judgeDefaultsQuery, scoreConfigsQuery } from '#/features/evaluation'
import { EvaluatorFormDialog } from '#/features/evaluation/components/evaluator-form-dialog'
import { setEvalDefinitionLive } from '#/features/evaluation/server/evals'
import type { JudgeDefaults } from '#/features/evaluation/server/judge'
import {
  getOnlineEvalStats,
  getScoreRollup,
  type OnlineEvalStat,
  type ScoreRollupRow,
} from '#/features/evaluation/server/scores'
import {
  DATA_TYPE_LABEL,
  type EvalDefinition,
  SCORE_SOURCE_ICON,
  SCORE_SOURCE_LABEL,
  SCORE_TONE_CLASS,
  type ScoreSource,
  type ScoreTone,
} from '#/lib/eval/evaluation'
import { errMessage, formatCost } from '#/lib/format'
import { queryKeys, STALE_LIVE_MS, STALE_TELEMETRY_MS } from '#/lib/query-keys'
import { ACCENT } from '#/lib/tone'
import { cn } from '#/lib/utils'

const rollupQuery = queryOptions({
  queryKey: queryKeys.scores.rollup('7d'),
  queryFn: () => {
    const nowMs = Date.now()
    return getScoreRollup({ data: { sinceMs: nowMs - 7 * 24 * 60 * 60 * 1000 } })
  },
  staleTime: STALE_TELEMETRY_MS,
})

const onlineStatsQuery = queryOptions({
  queryKey: queryKeys.evals.onlineStats(),
  queryFn: () => getOnlineEvalStats(),
  staleTime: STALE_LIVE_MS,
})

const SOURCE_ORDER: ScoreSource[] = ['human', 'llm', 'code']

export const Route = createFileRoute('/evals/')({
  loader: ({ context }) =>
    Promise.all([
      context.queryClient.ensureQueryData(definitionsQuery),
      context.queryClient.ensureQueryData(rollupQuery),
    ]),
  component: EvalsPage,
})

function passRateTone(rate: number): ScoreTone {
  if (rate >= 0.8) return 'good'
  if (rate >= 0.5) return 'warn'
  return 'bad'
}

function isLive(def: EvalDefinition): boolean {
  return def.mode === 'online'
}

function EvalsPage() {
  const { data: definitions = [], isLoading } = useQuery(definitionsQuery)
  const { data: rollup = [] } = useQuery(rollupQuery)
  const { data: judgeDefaults } = useQuery(judgeDefaultsQuery)
  const { data: onlineStats = {} } = useQuery(onlineStatsQuery)
  const { data: configs = [] } = useQuery(scoreConfigsQuery)

  const [setupOpen, setSetupOpen] = useState(false)

  // Cards only for defined dimensions or evaluator-owned names — never stray ingested names.
  const known = new Set([...definitions.map((d) => d.name), ...configs.map((c) => c.name)])
  const cards = rollup.filter((r) => known.has(r.name))

  return (
    <Page
      title="Evals"
      actions={
        <EvaluatorFormDialog
          open={setupOpen}
          onOpenChange={setSetupOpen}
          defaultModel={judgeDefaults?.model ?? ''}
          trigger={
            <Button size="sm">
              <Plus data-icon="inline-start" />
              Set up evaluator
            </Button>
          }
        />
      }
    >
      <div className="flex flex-col gap-6 px-4 lg:px-6">
        <div className="flex flex-col gap-1">
          {judgeDefaults && <JudgeStatus judge={judgeDefaults} />}
          <p className="text-xs text-muted-foreground">
            <span className="text-foreground">Live</span> evaluators score new traces automatically. The rest stay idle
            until you run them from their page.
          </p>
        </div>

        {isLoading ? (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {Array.from({ length: 4 }).map((_, i) => (
              // biome-ignore lint/suspicious/noArrayIndexKey: skeleton placeholders
              <Skeleton key={i} className="h-24 w-full rounded-xl" />
            ))}
          </div>
        ) : cards.length > 0 ? (
          <section className="flex flex-col gap-3">
            <h2 className="text-sm font-medium">Dimensions</h2>
            <RollupSection rows={cards} />
          </section>
        ) : null}

        {isLoading ? (
          <div className="flex flex-col gap-2">
            {Array.from({ length: 5 }).map((_, i) => (
              // biome-ignore lint/suspicious/noArrayIndexKey: skeleton placeholders
              <Skeleton key={i} className="h-10 w-full" />
            ))}
          </div>
        ) : definitions.length === 0 ? (
          <EvaluatorsEmpty onSetup={() => setSetupOpen(true)} />
        ) : (
          <EvaluatorsTable definitions={definitions} stats={onlineStats} />
        )}
      </div>
    </Page>
  )
}

function RollupSection({ rows }: { rows: ScoreRollupRow[] }) {
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
      {rows.map((row) => {
        const pct = Math.round(row.passRate * 100)
        return (
          <Card key={row.name} size="sm">
            <CardHeader>
              <CardTitle className="truncate text-sm" title={row.name}>
                {row.name}
              </CardTitle>
            </CardHeader>
            <CardContent className="flex items-baseline justify-between gap-2">
              <div className="flex flex-col gap-0.5">
                <span
                  className={cn('text-2xl font-semibold tabular-nums', SCORE_TONE_CLASS[passRateTone(row.passRate)])}
                >
                  {pct}%
                </span>
                <span className="flex gap-2 text-xs text-muted-foreground">
                  {SOURCE_ORDER.filter((s) => row.bySource[s] > 0).map((s) => (
                    <span key={s} title={SCORE_SOURCE_LABEL[s]}>
                      <span aria-hidden>{SCORE_SOURCE_ICON[s]}</span> {row.bySource[s]}
                    </span>
                  ))}
                </span>
              </div>
              {row.avg != null && (
                <span className="text-xs text-muted-foreground tabular-nums">avg {row.avg.toFixed(2)}</span>
              )}
            </CardContent>
          </Card>
        )
      })}
    </div>
  )
}

function EvaluatorsTable({
  definitions,
  stats,
}: {
  definitions: EvalDefinition[]
  stats: Record<number, OnlineEvalStat>
}) {
  return (
    <div className="-mx-4 border-y bg-background lg:-mx-6">
      <Table>
        <TableHeader className="bg-muted/40 [&_th]:font-normal [&_th]:text-muted-foreground">
          <TableRow className="[&>:first-child]:pl-4 [&>:last-child]:pr-4 lg:[&>:first-child]:pl-6 lg:[&>:last-child]:pr-6">
            <TableHead>Evaluator</TableHead>
            <TableHead>Live</TableHead>
            <TableHead>Result</TableHead>
            <TableHead className="text-right">Cost</TableHead>
            <TableHead>Model</TableHead>
            <TableHead>Updated</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {[...definitions]
            .sort((a, b) => a.name.localeCompare(b.name))
            .map((def) => {
              const stat = stats[def.id]
              return (
                <TableRow
                  key={def.id}
                  className="[&>:first-child]:pl-4 [&>:last-child]:pr-4 lg:[&>:first-child]:pl-6 lg:[&>:last-child]:pr-6"
                >
                  <TableCell className="py-2.5">
                    <div className="flex flex-col gap-0.5">
                      <div className="flex items-center gap-1.5">
                        <Link
                          to="/evals/$evalId"
                          params={{ evalId: String(def.id) }}
                          className="font-medium text-foreground hover:underline"
                        >
                          {def.name}
                        </Link>
                        {isLive(def) && <StatusDot pulse className="text-success" />}
                      </div>
                      <span className="text-xs capitalize text-muted-foreground">
                        {def.scope} · {DATA_TYPE_LABEL[def.dataType]}
                      </span>
                    </div>
                  </TableCell>
                  <TableCell>
                    <LiveToggle id={def.id} live={isLive(def)} />
                  </TableCell>
                  <TableCell>
                    <ResultCell stat={stat} />
                  </TableCell>
                  <TableCell className="text-right tabular-nums text-muted-foreground">
                    {stat?.costUsd ? formatCost(stat.costUsd) : '—'}
                  </TableCell>
                  <TableCell>
                    <span className={`font-mono text-xs ${ACCENT.violet.ident}`}>{def.model || '—'}</span>
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    <RelativeTime ts={def.updatedAt} />
                  </TableCell>
                </TableRow>
              )
            })}
        </TableBody>
      </Table>
    </div>
  )
}

function ResultCell({ stat }: { stat: OnlineEvalStat | undefined }) {
  if (!stat || stat.passRate == null) {
    return <span className="text-sm text-muted-foreground">{stat?.scored ? `${stat.scored} scored` : '—'}</span>
  }
  const tone = passRateTone(stat.passRate)
  const pct = Math.round(stat.passRate * 100)
  return (
    <div className="flex items-center gap-2.5">
      <ProgressCircle value={pct} className={SCORE_TONE_CLASS[tone]}>
        <span className={cn('text-[10px] font-semibold tabular-nums', SCORE_TONE_CLASS[tone])}>{pct}</span>
      </ProgressCircle>
      <div className="flex flex-col gap-0">
        <span className="text-sm text-foreground">
          <span className="font-medium tabular-nums">{stat.pass}</span> pass
        </span>
        <span className="text-xs tabular-nums text-muted-foreground">of {stat.scored} scored</span>
      </div>
    </div>
  )
}

function JudgeStatus({ judge }: { judge: JudgeDefaults }) {
  if (!judge.configured) {
    return (
      <p className="text-xs text-muted-foreground">
        No judge model configured. Set <span className="font-mono text-foreground">OPENAI_API_KEY</span>,{' '}
        <span className="font-mono text-foreground">ANTHROPIC_API_KEY</span>, or{' '}
        <span className="font-mono text-foreground">AZURE_OPENAI_API_KEY</span> to run judges.
      </p>
    )
  }
  const keys = [
    judge.hasOpenAIKey && 'OpenAI',
    judge.hasAnthropicKey && 'Anthropic',
    judge.hasAzureKey && 'Azure OpenAI',
  ].filter(Boolean) as string[]
  return (
    <p className="text-xs text-muted-foreground">
      Judge: <span className={`font-mono ${ACCENT.violet.ident}`}>{judge.model}</span>
      {keys.length > 0 && <> · {keys.join(', ')} ready</>}
    </p>
  )
}

function LiveToggle({ id, live }: { id: number; live: boolean }) {
  const queryClient = useQueryClient()

  const mutation = useMutation({
    mutationFn: (next: boolean) => setEvalDefinitionLive({ data: { id, live: next } }),
    onSuccess: async (_data, next) => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.evals.definitions() })
      toast.success(next ? 'Now scoring live traffic' : 'Moved to library')
    },
    onError: (err) => toast.error(errMessage(err)),
  })

  return (
    <Switch
      size="sm"
      checked={live}
      disabled={mutation.isPending}
      onCheckedChange={(checked) => mutation.mutate(checked)}
      aria-label="Toggle live scoring"
    />
  )
}

function EvaluatorsEmpty({ onSetup }: { onSetup: () => void }) {
  return (
    <Empty>
      <EmptyHeader>
        <EmptyMedia variant="icon">
          <TestTube />
        </EmptyMedia>
        <EmptyTitle>No evaluators yet</EmptyTitle>
        <EmptyDescription>Set up an LLM-judge or code evaluator to start scoring your traces.</EmptyDescription>
      </EmptyHeader>
      <Button size="sm" onClick={onSetup}>
        <Plus data-icon="inline-start" />
        Set up evaluator
      </Button>
    </Empty>
  )
}
