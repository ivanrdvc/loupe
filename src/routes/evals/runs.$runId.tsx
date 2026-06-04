import { TestTubeIcon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { queryOptions, useQuery } from '@tanstack/react-query'
import { createFileRoute, Link } from '@tanstack/react-router'
import { useMemo, useState } from 'react'
import { Page } from '#/components/page'
import { RelativeTime } from '#/components/relative-time'
import { ScoreValue } from '#/components/scores/score-value'
import { Badge } from '#/components/ui/badge'
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '#/components/ui/breadcrumb'
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '#/components/ui/empty'
import { Label } from '#/components/ui/label'
import { Skeleton } from '#/components/ui/skeleton'
import { Switch } from '#/components/ui/switch'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '#/components/ui/table'
import { Tooltip, TooltipContent, TooltipTrigger } from '#/components/ui/tooltip'
import {
  type ConfigHint,
  EVAL_RUN_STATUS_BADGE,
  type EvalRun,
  isEvalRunActive,
  judgeErrorHint,
  SCORE_TONE_CLASS,
  type Score,
  scoreIsBad,
} from '#/lib/eval/evaluation'
import { formatCost } from '#/lib/format'
import { queryKeys, STALE_LIVE_MS } from '#/lib/query-keys'
import { cn } from '#/lib/utils'
import { getEvalDefinition, getEvalRun } from '#/server/evals'
import { listScoreConfigs, listScoresByRun } from '#/server/scores'

const runQuery = (id: number) =>
  queryOptions({
    queryKey: queryKeys.evals.run(id),
    queryFn: () => getEvalRun({ data: id }),
    staleTime: STALE_LIVE_MS,
  })

const runScoresQuery = (id: number) =>
  queryOptions({
    queryKey: queryKeys.evals.runScores(id),
    queryFn: () => listScoresByRun({ data: id }),
    staleTime: STALE_LIVE_MS,
  })

export const Route = createFileRoute('/evals/runs/$runId')({
  loader: ({ context, params }) =>
    Promise.all([
      context.queryClient.ensureQueryData(runQuery(Number(params.runId))),
      context.queryClient.ensureQueryData(runScoresQuery(Number(params.runId))),
    ]),
  component: RunDetailPage,
})

function RunDetailPage() {
  const { runId } = Route.useParams()
  const id = Number(runId)
  // Runs execute as a background job, so poll while pending/running to fill in.
  const { data: run, isLoading } = useQuery({
    ...runQuery(id),
    refetchInterval: (q) => (isEvalRunActive(q.state.data?.status) ? 1500 : false),
  })

  if (isLoading) {
    return (
      <Page title={<RunBreadcrumb id={id} />}>
        <div className="flex flex-col gap-4 px-4 lg:px-6">
          <Skeleton className="h-20 w-full" />
          <Skeleton className="h-64 w-full" />
        </div>
      </Page>
    )
  }

  if (!run) {
    return (
      <Page title={<RunBreadcrumb id={id} />}>
        <div className="px-4 lg:px-6">
          <Empty>
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <HugeiconsIcon icon={TestTubeIcon} />
              </EmptyMedia>
              <EmptyTitle>Run not found</EmptyTitle>
              <EmptyDescription>
                This run may have been deleted.{' '}
                <Link to="/evals" className="text-primary underline-offset-4 hover:underline">
                  Back to evals
                </Link>
                .
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        </div>
      </Page>
    )
  }

  return <RunDetailLoaded run={run} />
}

function RunBreadcrumb({
  id,
  definitionId,
  evaluatorName,
}: {
  id: number
  definitionId?: number
  evaluatorName?: string
}) {
  return (
    <Breadcrumb>
      <BreadcrumbList>
        <BreadcrumbItem>
          <BreadcrumbLink asChild>
            <Link to="/evals">Evals</Link>
          </BreadcrumbLink>
        </BreadcrumbItem>
        {definitionId != null && (
          <>
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              <BreadcrumbLink asChild>
                <Link to="/evals/$evalId" params={{ evalId: String(definitionId) }}>
                  {evaluatorName ?? `Evaluator #${definitionId}`}
                </Link>
              </BreadcrumbLink>
            </BreadcrumbItem>
          </>
        )}
        <BreadcrumbSeparator />
        <BreadcrumbItem>
          <BreadcrumbPage>Run #{id}</BreadcrumbPage>
        </BreadcrumbItem>
      </BreadcrumbList>
    </Breadcrumb>
  )
}

function StatTile({ label, value, className }: { label: string; value: React.ReactNode; className?: string }) {
  return (
    <div className="flex flex-col gap-1 rounded-lg border bg-card/40 px-3 py-2">
      <span className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">{label}</span>
      <span className={cn('text-sm font-medium tabular-nums', className)}>{value}</span>
    </div>
  )
}

function RunDetailLoaded({ run }: { run: EvalRun }) {
  const id = run.id
  const { data: scores = [], isLoading } = useQuery({
    ...runScoresQuery(id),
    refetchInterval: isEvalRunActive(run.status) ? 1500 : false,
  })
  // Fetch the parent evaluator so the breadcrumb can name it (not just "Run #N").
  const { data: definitionDetail } = useQuery({
    queryKey: queryKeys.evals.definition(run.definitionId),
    queryFn: () => getEvalDefinition({ data: run.definitionId }),
    staleTime: STALE_LIVE_MS,
  })
  const evaluatorName = definitionDetail?.definition.name
  const [failedOnly, setFailedOnly] = useState(false)

  // Per-dimension polarity/scale, so verdicts classify against their config (not
  // the lexicon/unscaled fallback) — required for correct tone + "Failed only".
  const { data: configs = [] } = useQuery({
    queryKey: queryKeys.scores.configs(),
    queryFn: () => listScoreConfigs(),
    staleTime: STALE_LIVE_MS,
  })
  const scaleByName = useMemo(
    () =>
      new Map<string, ConfigHint>(
        configs.map((c) => [
          c.name,
          {
            minValue: c.minValue,
            maxValue: c.maxValue,
            passLabels: c.passLabels,
            failLabels: c.failLabels,
            direction: c.direction,
          },
        ]),
      ),
    [configs],
  )

  const summary = run.summary
  // "Failed only" also surfaces errored cases (scoreIsBad is false for null-verdict errors).
  const visible = useMemo(
    () => (failedOnly ? scores.filter((s) => scoreIsBad(s, scaleByName.get(s.name)) || s.errorType != null) : scores),
    [scores, failedOnly, scaleByName],
  )
  // Surface a specific hint when the run errored because the judge endpoint is
  // down/misconfigured, rather than leaving a bare `network_error` per case.
  const endpointHint = useMemo(
    () =>
      judgeErrorHint(
        run.status,
        scores.map((s) => s.errorType),
      ),
    [run.status, scores],
  )

  return (
    <Page title={<RunBreadcrumb id={id} definitionId={run.definitionId} evaluatorName={evaluatorName} />}>
      <div className="flex flex-col gap-4 px-4 py-4 lg:px-6">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-lg font-semibold">Run #{id}</h1>
          <Badge variant={EVAL_RUN_STATUS_BADGE[run.status]} className="capitalize">
            {run.status}
          </Badge>
          {run.blessed && <Badge variant="outline">Blessed</Badge>}
          {(run.gitSha || run.env) && (
            <span className="text-xs text-muted-foreground">
              {run.gitSha && <span className="font-mono">{run.gitSha.slice(0, 7)}</span>}
              {run.gitSha && run.env && ' · '}
              {run.env}
            </span>
          )}
          <div className="ml-auto flex items-center gap-3 text-xs text-muted-foreground">
            {run.startedAt != null && (
              <span>
                Started <RelativeTime ts={run.startedAt} className="tabular-nums" />
              </span>
            )}
            {run.endedAt != null && (
              <span>
                Ended <RelativeTime ts={run.endedAt} className="tabular-nums" />
              </span>
            )}
          </div>
        </div>

        {endpointHint && (
          <div className="rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
            {endpointHint}
          </div>
        )}

        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
          <StatTile label="Total" value={summary?.total ?? scores.length} />
          <StatTile label="Pass" value={summary?.pass ?? '—'} className="text-emerald-600 dark:text-emerald-400" />
          <StatTile label="Fail" value={summary?.fail ?? '—'} className="text-destructive" />
          <StatTile
            label="Errors"
            value={summary?.errors ?? '—'}
            className={summary?.errors ? 'text-destructive' : undefined}
          />
          <StatTile label="Cost" value={formatCost(summary?.costUsd ?? 0)} />
          <StatTile label="Model" value={<span className="font-mono text-xs">{summary?.model ?? '—'}</span>} />
        </div>

        <div className="flex items-center justify-between gap-2">
          <h2 className="text-sm font-medium">Cases</h2>
          <div className="flex items-center gap-2">
            <Label htmlFor="failed-only" className="text-xs text-muted-foreground">
              Failed only
            </Label>
            <Switch id="failed-only" checked={failedOnly} onCheckedChange={setFailedOnly} />
          </div>
        </div>

        {isLoading ? (
          <div className="flex flex-col gap-2">
            {Array.from({ length: 5 }).map((_, i) => (
              // biome-ignore lint/suspicious/noArrayIndexKey: skeleton placeholders
              <Skeleton key={i} className="h-10 w-full" />
            ))}
          </div>
        ) : scores.length === 0 ? (
          <Empty>
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <HugeiconsIcon icon={TestTubeIcon} />
              </EmptyMedia>
              <EmptyTitle>No cases in this run</EmptyTitle>
              <EmptyDescription>This run produced no scored cases.</EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : (
          <div className="-mx-4 border-y bg-background lg:-mx-6">
            <Table>
              <TableHeader className="bg-muted/40 [&_th]:font-normal [&_th]:text-muted-foreground">
                <TableRow className="[&>:first-child]:pl-4 [&>:last-child]:pr-4 lg:[&>:first-child]:pl-6 lg:[&>:last-child]:pr-6">
                  <TableHead>Target</TableHead>
                  <TableHead>Verdict</TableHead>
                  <TableHead>Explanation</TableHead>
                  <TableHead>Error</TableHead>
                  <TableHead className="text-right">When</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {visible.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className="h-24 text-center text-muted-foreground">
                      No failed cases.
                    </TableCell>
                  </TableRow>
                ) : (
                  visible.map((score) => <CaseRow key={score.id} score={score} scale={scaleByName.get(score.name)} />)
                )}
              </TableBody>
            </Table>
          </div>
        )}
      </div>
    </Page>
  )
}

function CaseRow({ score, scale }: { score: Score; scale?: ConfigHint }) {
  const bad = scoreIsBad(score, scale)
  const traceTarget = score.parentTraceId ?? score.targetId
  // Only a synthetic dataset item with no backing trace is non-linkable; items
  // sourced from real traces/spans keep their real id and stay linkable.
  const isItem = score.datasetRunItemId != null && score.parentTraceId == null && score.targetId.startsWith('item:')

  return (
    <TableRow className="[&>:first-child]:pl-4 [&>:last-child]:pr-4 lg:[&>:first-child]:pl-6 lg:[&>:last-child]:pr-6">
      <TableCell>
        <span className="flex items-center gap-2">
          <Badge variant="outline" className="capitalize">
            {score.targetKind}
          </Badge>
          {isItem ? (
            <span className="max-w-[16rem] truncate font-mono text-xs text-muted-foreground" title={score.targetId}>
              {score.targetId}
            </span>
          ) : (
            <Link
              to="/traces"
              search={{ trace: traceTarget }}
              className="max-w-[16rem] truncate font-mono text-xs text-primary underline-offset-4 hover:underline"
              title={score.targetId}
            >
              {score.targetId}
            </Link>
          )}
        </span>
      </TableCell>
      <TableCell>
        <ScoreValue
          score={score}
          scale={scale}
          className={cn('font-medium', bad ? SCORE_TONE_CLASS.bad : SCORE_TONE_CLASS.good)}
        />
      </TableCell>
      <TableCell className="max-w-[28rem]">
        {score.explanation ? (
          <Tooltip>
            <TooltipTrigger asChild>
              <span className="block truncate text-xs text-muted-foreground">{score.explanation}</span>
            </TooltipTrigger>
            <TooltipContent side="bottom" className="max-w-md whitespace-pre-wrap">
              {score.explanation}
            </TooltipContent>
          </Tooltip>
        ) : (
          <span className="text-xs text-muted-foreground">—</span>
        )}
      </TableCell>
      <TableCell>
        {score.errorType ? (
          <Badge variant="destructive" className="font-mono text-[11px]">
            {score.errorType}
          </Badge>
        ) : (
          <span className="text-xs text-muted-foreground">—</span>
        )}
      </TableCell>
      <TableCell className="text-right">
        <RelativeTime ts={score.createdAt} className="text-xs text-muted-foreground tabular-nums" />
      </TableCell>
    </TableRow>
  )
}
