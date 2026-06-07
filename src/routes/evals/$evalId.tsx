import {
  ArrowLeft01Icon,
  Delete02Icon,
  PauseIcon,
  PencilEdit02Icon,
  PlayIcon,
  StarIcon,
  TestTubeIcon,
} from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { queryOptions, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { createFileRoute, Link, useNavigate } from '@tanstack/react-router'
import { useMemo, useState } from 'react'
import { toast } from 'sonner'
import { Markdown } from '#/components/markdown'
import { Page } from '#/components/page'
import { PageBreadcrumb } from '#/components/page-breadcrumb'
import { RelativeTime } from '#/components/relative-time'
import { Badge } from '#/components/ui/badge'
import { Button } from '#/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '#/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '#/components/ui/dialog'
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '#/components/ui/empty'
import { Input } from '#/components/ui/input'
import { Label } from '#/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '#/components/ui/select'
import { Skeleton } from '#/components/ui/skeleton'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '#/components/ui/table'
import { Textarea } from '#/components/ui/textarea'
import { ModelSelect } from '#/features/evaluation/components/model-select'
import { ScoreValue } from '#/features/evaluation/components/score-value'
import {
  blessEvalRun,
  compareRuns,
  deleteEvalDefinition,
  getEvalDefinition,
  setEvalDefinitionLive,
  upsertEvalDefinition,
} from '#/features/evaluation/server/evals'
import { listScoresByDefinition } from '#/features/evaluation/server/scores'
import type {
  EvalCompareRow,
  EvalDefinition,
  EvalMode,
  EvalRun,
  EvalScope,
  EvalSourceKind,
  LiveFilter,
  Score,
  ScoreDataType,
  UpsertEvalDefinitionInput,
} from '#/lib/eval/evaluation'
import {
  EVAL_RUN_STATUS_BADGE,
  isEvalRunActive,
  SCORE_DATA_TYPES,
  SCORE_TARGET_KINDS,
  SCORE_TONE_CLASS,
  scoreIsBad,
} from '#/lib/eval/evaluation'
import { errMessage, formatCost } from '#/lib/format'
import { queryKeys, STALE_LIVE_MS, STALE_TELEMETRY_MS } from '#/lib/query-keys'
import { cn } from '#/lib/utils'

const evalQuery = (id: number) =>
  queryOptions({
    queryKey: queryKeys.evals.definition(id),
    queryFn: () => getEvalDefinition({ data: id }),
    staleTime: STALE_LIVE_MS,
  })

const compareQuery = (base: number, head: number) =>
  queryOptions({
    queryKey: queryKeys.evals.compare(base, head),
    queryFn: () => compareRuns({ data: { base, head } }),
    staleTime: STALE_TELEMETRY_MS,
  })

const scoresQuery = (id: number) =>
  queryOptions({
    queryKey: queryKeys.evals.definitionScores(id),
    queryFn: () => listScoresByDefinition({ data: id }),
    staleTime: STALE_LIVE_MS,
  })

export const Route = createFileRoute('/evals/$evalId')({
  loader: ({ context, params }) => context.queryClient.ensureQueryData(evalQuery(Number(params.evalId))),
  component: EvalDetailPage,
})

function EvalDetailPage() {
  const { evalId } = Route.useParams()
  const id = Number(evalId)
  // Runs execute as a background job, so poll while any run is active to fill in.
  const { data, isLoading } = useQuery({
    ...evalQuery(id),
    refetchInterval: (q) => (q.state.data?.runs.some((r) => isEvalRunActive(r.status)) ? 1500 : false),
  })

  if (isLoading) {
    return (
      <Page title={<EvalBreadcrumb />}>
        <div className="flex flex-col gap-4 px-4 lg:px-6">
          <Skeleton className="h-6 w-48" />
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-48 w-full" />
        </div>
      </Page>
    )
  }

  if (!data) {
    return (
      <Page title={<EvalBreadcrumb />}>
        <div className="px-4 lg:px-6">
          <Empty>
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <HugeiconsIcon icon={TestTubeIcon} />
              </EmptyMedia>
              <EmptyTitle>Evaluator not found</EmptyTitle>
              <EmptyDescription>This evaluator may have been deleted.</EmptyDescription>
            </EmptyHeader>
            <Button asChild variant="outline" size="sm">
              <Link to="/evals">
                <HugeiconsIcon icon={ArrowLeft01Icon} strokeWidth={2} data-icon="inline-start" />
                Back to evals
              </Link>
            </Button>
          </Empty>
        </div>
      </Page>
    )
  }

  return <EvalDetailLoaded key={data.definition.id} definition={data.definition} runs={data.runs} />
}

function EvalBreadcrumb({ name }: { name?: string }) {
  return <PageBreadcrumb crumbs={[{ label: 'Evals', to: '/evals' }, { label: name ?? '—' }]} />
}

function EvalDetailLoaded({ definition, runs }: { definition: EvalDefinition; runs: EvalRun[] }) {
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const id = definition.id
  const [editOpen, setEditOpen] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)

  const invalidateDetail = () => queryClient.invalidateQueries({ queryKey: queryKeys.evals.definition(id) })

  const liveMutation = useMutation({
    mutationFn: (live: boolean) => setEvalDefinitionLive({ data: { id, live } }),
    onSuccess: async (_data, live) => {
      await invalidateDetail()
      await queryClient.invalidateQueries({ queryKey: queryKeys.evals.definitions() })
      toast.success(live ? 'Now scoring live traffic' : 'Moved to library')
    },
    onError: (err) => toast.error(errMessage(err)),
  })

  const deleteMutation = useMutation({
    mutationFn: () => deleteEvalDefinition({ data: id }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.evals.all() })
      toast.success('Evaluator deleted')
      void navigate({ to: '/evals' })
    },
    onError: (err) => toast.error(errMessage(err)),
  })

  const blessMutation = useMutation({
    mutationFn: (vars: { runId: number; blessed: boolean }) =>
      blessEvalRun({ data: { id: vars.runId, blessed: vars.blessed } }),
    onSuccess: async (_data, vars) => {
      await invalidateDetail()
      toast.success(vars.blessed ? 'Run blessed' : 'Run unblessed')
    },
    onError: (err) => toast.error(errMessage(err)),
  })

  const live = definition.mode === 'online'

  return (
    <Page title={<EvalBreadcrumb name={definition.name} />}>
      <div className="flex flex-col gap-6 px-4 py-6 lg:px-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex flex-col gap-1">
            <h1 className="text-lg font-semibold">{definition.name}</h1>
            <Badge variant={live ? 'success' : 'outline'} className={cn(!live && 'text-muted-foreground')}>
              {live ? 'Live' : 'Library'}
            </Badge>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => setEditOpen(true)}>
              <HugeiconsIcon icon={PencilEdit02Icon} strokeWidth={2} data-icon="inline-start" />
              Edit
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={liveMutation.isPending}
              onClick={() => liveMutation.mutate(!live)}
            >
              <HugeiconsIcon icon={live ? PauseIcon : PlayIcon} strokeWidth={2} data-icon="inline-start" />
              {live ? 'Move to library' : 'Go live'}
            </Button>
            <Button variant="outline" size="sm" onClick={() => setDeleteOpen(true)}>
              <HugeiconsIcon icon={Delete02Icon} strokeWidth={2} data-icon="inline-start" />
              Delete
            </Button>
          </div>
        </div>

        <MetaGrid definition={definition} />

        {definition.source === 'code' && (
          <p className="text-sm text-muted-foreground">
            Code evaluators cannot be run yet. Edit and switch the source to LLM judge.
          </p>
        )}

        {definition.source === 'llm' && definition.judgePrompt && (
          <Card>
            <CardHeader>
              <CardTitle className="text-sm">Judge prompt</CardTitle>
            </CardHeader>
            <CardContent>
              <Markdown>{definition.judgePrompt}</Markdown>
            </CardContent>
          </Card>
        )}

        <section className="flex flex-col gap-3">
          <h2 className="text-sm font-medium">Runs</h2>
          <RunsTable
            runs={runs}
            baselineRunId={definition.baselineRunId}
            blessingId={blessMutation.isPending ? blessMutation.variables?.runId : undefined}
            onToggleBless={(runId, blessed) => blessMutation.mutate({ runId, blessed })}
          />
        </section>

        <EvaluatorScores id={id} />

        {definition.baselineRunId != null && runs.length >= 2 && (
          <CompareSection baselineRunId={definition.baselineRunId} runs={runs} />
        )}
      </div>

      <EditDialog
        key={definition.updatedAt}
        open={editOpen}
        onOpenChange={setEditOpen}
        definition={definition}
        onSaved={async () => {
          await invalidateDetail()
          await queryClient.invalidateQueries({ queryKey: queryKeys.evals.definitions() })
          setEditOpen(false)
        }}
      />

      <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete this evaluator?</DialogTitle>
            <DialogDescription>
              Removes <span className="font-mono text-foreground">{definition.name}</span> and its run history. This
              can't be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteOpen(false)}>
              Cancel
            </Button>
            <Button variant="destructive" disabled={deleteMutation.isPending} onClick={() => deleteMutation.mutate()}>
              {deleteMutation.isPending ? 'Deleting…' : 'Delete'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Page>
  )
}

function MetaItem({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">{label}</span>
      <span className="text-sm">{children}</span>
    </div>
  )
}

function MetaGrid({ definition }: { definition: EvalDefinition }) {
  return (
    <div className="grid grid-cols-2 gap-4 rounded-lg border bg-card/40 px-4 py-4 sm:grid-cols-3 lg:grid-cols-6">
      <MetaItem label="Scope">
        <span className="capitalize">{definition.scope}</span>
      </MetaItem>
      <MetaItem label="Data type">
        <span className="capitalize">{definition.dataType}</span>
      </MetaItem>
      <MetaItem label="Source">
        <Badge variant="outline" className="uppercase">
          {definition.source}
        </Badge>
      </MetaItem>
      <MetaItem label="State">
        <span>{definition.mode === 'online' ? 'Live' : 'Library'}</span>
      </MetaItem>
      {definition.mode === 'online' && <MetaItem label="Watches">{describeLiveFilter(definition.liveFilter)}</MetaItem>}
      <MetaItem label="Model">
        <span className="font-mono text-xs">{definition.model || '—'}</span>
      </MetaItem>
    </div>
  )
}

function RunsTable({
  runs,
  baselineRunId,
  blessingId,
  onToggleBless,
}: {
  runs: EvalRun[]
  baselineRunId: number | null
  blessingId: number | undefined
  onToggleBless: (runId: number, blessed: boolean) => void
}) {
  const sorted = useMemo(() => [...runs].sort((a, b) => b.createdAt - a.createdAt), [runs])

  if (runs.length === 0) {
    return (
      <div className="rounded-lg border bg-card/40 px-4 py-6 text-sm text-muted-foreground">
        No runs yet. Run this evaluator over a dataset from the dataset page.
      </div>
    )
  }

  return (
    <div className="-mx-4 border-y bg-background lg:-mx-6">
      <Table>
        <TableHeader className="bg-muted/40 [&_th]:font-normal [&_th]:text-muted-foreground">
          <TableRow className="[&>:first-child]:pl-4 [&>:last-child]:pr-4 lg:[&>:first-child]:pl-6 lg:[&>:last-child]:pr-6">
            <TableHead>Run</TableHead>
            <TableHead>Status</TableHead>
            <TableHead className="text-right">Pass</TableHead>
            <TableHead className="text-right">Fail</TableHead>
            <TableHead className="text-right">Errors</TableHead>
            <TableHead className="text-right">Cost</TableHead>
            <TableHead>Created</TableHead>
            <TableHead className="w-10" />
          </TableRow>
        </TableHeader>
        <TableBody>
          {sorted.map((run) => {
            const summary = run.summary
            const isBaseline = run.id === baselineRunId
            return (
              <TableRow
                key={run.id}
                className="[&>:first-child]:pl-4 [&>:last-child]:pr-4 lg:[&>:first-child]:pl-6 lg:[&>:last-child]:pr-6"
              >
                <TableCell>
                  <div className="flex items-center gap-2">
                    <Link
                      to="/evals/runs/$runId"
                      params={{ runId: String(run.id) }}
                      className="font-mono text-sm hover:underline"
                    >
                      #{run.id}
                    </Link>
                    {isBaseline && (
                      <Badge variant="outline" className="text-muted-foreground">
                        baseline
                      </Badge>
                    )}
                  </div>
                </TableCell>
                <TableCell>
                  <Badge variant={EVAL_RUN_STATUS_BADGE[run.status]} className="capitalize">
                    {run.status}
                  </Badge>
                </TableCell>
                <TableCell className="text-right tabular-nums text-emerald-600 dark:text-emerald-400">
                  {summary?.pass ?? '—'}
                </TableCell>
                <TableCell className="text-right tabular-nums text-destructive">{summary?.fail ?? '—'}</TableCell>
                <TableCell className="text-right tabular-nums text-muted-foreground">
                  {summary?.errors ?? '—'}
                </TableCell>
                <TableCell className="text-right tabular-nums">{formatCost(summary?.costUsd ?? 0)}</TableCell>
                <TableCell className="text-muted-foreground">
                  <RelativeTime ts={run.createdAt} />
                </TableCell>
                <TableCell>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="size-7"
                    disabled={blessingId === run.id}
                    aria-label={run.blessed ? 'Unbless run' : 'Bless run'}
                    title={run.blessed ? 'Blessed — click to unbless' : 'Bless run'}
                    onClick={() => onToggleBless(run.id, !run.blessed)}
                  >
                    <HugeiconsIcon
                      icon={StarIcon}
                      strokeWidth={2}
                      className={cn('size-4', run.blessed ? 'fill-amber-400 text-amber-500' : 'text-muted-foreground')}
                    />
                  </Button>
                </TableCell>
              </TableRow>
            )
          })}
        </TableBody>
      </Table>
    </div>
  )
}

const SCORES_PAGE_SIZE = 25

function EvaluatorScores({ id }: { id: number }) {
  const { data: scores = [] } = useQuery(scoresQuery(id))
  const [page, setPage] = useState(0)
  if (scores.length === 0) return null

  const pageCount = Math.ceil(scores.length / SCORES_PAGE_SIZE)
  const clampedPage = Math.min(page, pageCount - 1)
  const start = clampedPage * SCORES_PAGE_SIZE
  const pageScores = scores.slice(start, start + SCORES_PAGE_SIZE)

  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-sm font-medium">Scores</h2>
      <div className="-mx-4 border-y bg-background lg:-mx-6">
        <Table>
          <TableHeader className="bg-muted/40 [&_th]:font-normal [&_th]:text-muted-foreground">
            <TableRow className="[&>:first-child]:pl-4 [&>:last-child]:pr-4 lg:[&>:first-child]:pl-6 lg:[&>:last-child]:pr-6">
              <TableHead>Target</TableHead>
              <TableHead>Verdict</TableHead>
              <TableHead>Explanation</TableHead>
              <TableHead className="text-right">When</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {pageScores.map((score) => (
              <ScoreRow key={score.id} score={score} />
            ))}
          </TableBody>
        </Table>
      </div>
      {pageCount > 1 && (
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span className="tabular-nums">
            {start + 1}–{start + pageScores.length} of {scores.length}
          </span>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" disabled={clampedPage === 0} onClick={() => setPage(clampedPage - 1)}>
              Previous
            </Button>
            <span className="tabular-nums">
              {clampedPage + 1} / {pageCount}
            </span>
            <Button
              variant="outline"
              size="sm"
              disabled={clampedPage >= pageCount - 1}
              onClick={() => setPage(clampedPage + 1)}
            >
              Next
            </Button>
          </div>
        </div>
      )}
    </section>
  )
}

function ScoreRow({ score }: { score: Score }) {
  const traceTarget = score.parentTraceId ?? score.targetId
  const isItem = score.datasetRunItemId != null && score.parentTraceId == null && score.targetId.startsWith('item:')
  return (
    <TableRow className="[&>:first-child]:pl-4 [&>:last-child]:pr-4 lg:[&>:first-child]:pl-6 lg:[&>:last-child]:pr-6">
      <TableCell>
        {isItem ? (
          <span className="font-mono text-xs text-muted-foreground">{score.targetId}</span>
        ) : (
          <Link
            to="/traces"
            search={{ trace: traceTarget }}
            className="font-mono text-xs text-primary underline-offset-4 hover:underline"
          >
            {score.targetId}
          </Link>
        )}
      </TableCell>
      <TableCell>
        <ScoreValue
          score={score}
          className={cn('font-medium', scoreIsBad(score) ? SCORE_TONE_CLASS.bad : SCORE_TONE_CLASS.good)}
        />
      </TableCell>
      <TableCell className="max-w-[28rem] truncate text-xs text-muted-foreground">{score.explanation ?? '—'}</TableCell>
      <TableCell className="text-right">
        <RelativeTime ts={score.createdAt} className="text-xs text-muted-foreground tabular-nums" />
      </TableCell>
    </TableRow>
  )
}

function CompareSection({ baselineRunId, runs }: { baselineRunId: number; runs: EvalRun[] }) {
  const base = baselineRunId
  const headOptions = useMemo(
    () => [...runs].filter((r) => r.id !== base).sort((a, b) => b.createdAt - a.createdAt),
    [runs, base],
  )
  const [head, setHead] = useState<number | null>(null)
  // Fall back to the most recent run if the chosen head is stale or is the base
  // (re-blessing can change `base`), so a run never compares against itself.
  const effectiveHead =
    head != null && head !== base && headOptions.some((r) => r.id === head) ? head : (headOptions[0]?.id ?? null)

  return (
    <section className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-3">
        <h2 className="text-sm font-medium">vs baseline</h2>
        <span className="font-mono text-xs text-muted-foreground">baseline #{base}</span>
        <span className="text-xs text-muted-foreground">→</span>
        <Select value={effectiveHead != null ? String(effectiveHead) : ''} onValueChange={(v) => setHead(Number(v))}>
          <SelectTrigger size="sm" className="w-40">
            <SelectValue placeholder="Pick head run" />
          </SelectTrigger>
          <SelectContent>
            {headOptions.map((r) => (
              <SelectItem key={r.id} value={String(r.id)}>
                Run #{r.id}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Gate on effectiveHead so the query only ever mounts with a real run id. */}
      {effectiveHead == null ? (
        <div className="rounded-lg border bg-card/40 px-4 py-6 text-sm text-muted-foreground">
          Pick a head run to compare against the baseline.
        </div>
      ) : (
        <CompareBody base={base} head={effectiveHead} />
      )}
    </section>
  )
}

// Split out so the compare query only ever mounts with real run ids.
function CompareBody({ base, head }: { base: number; head: number }) {
  const { data: rows = [], isLoading } = useQuery(compareQuery(base, head))

  if (isLoading) {
    return (
      <div className="flex flex-col gap-2 rounded-lg border bg-card/40 p-4">
        <Skeleton className="h-8 w-full" />
        <Skeleton className="h-8 w-full" />
      </div>
    )
  }
  if (rows.length === 0) {
    return (
      <div className="rounded-lg border bg-card/40 px-4 py-6 text-sm text-muted-foreground">
        No shared dimensions between these runs.
      </div>
    )
  }
  return <CompareTable rows={rows} />
}

function CompareTable({ rows }: { rows: EvalCompareRow[] }) {
  // A side with zero classifiable cases has no pass rate — show "—" so it reads
  // as "no cases" rather than a genuine 0% (a real failing score).
  const pct = (n: number, total: number) => (total > 0 ? `${Math.round(n * 100)}%` : '—')
  return (
    <div className="-mx-4 border-y bg-background lg:-mx-6">
      <Table>
        <TableHeader className="bg-muted/40 [&_th]:font-normal [&_th]:text-muted-foreground">
          <TableRow className="[&>:first-child]:pl-4 [&>:last-child]:pr-4 lg:[&>:first-child]:pl-6 lg:[&>:last-child]:pr-6">
            <TableHead>Dimension</TableHead>
            <TableHead className="text-right">Base pass%</TableHead>
            <TableHead className="text-right">Head pass%</TableHead>
            <TableHead className="text-right">→ fail</TableHead>
            <TableHead className="text-right">→ pass</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row) => (
            <TableRow
              key={row.name}
              className="[&>:first-child]:pl-4 [&>:last-child]:pr-4 lg:[&>:first-child]:pl-6 lg:[&>:last-child]:pr-6"
            >
              <TableCell className="font-medium">{row.name}</TableCell>
              <TableCell className="text-right tabular-nums text-muted-foreground">
                {pct(row.basePassRate, row.baseTotal)}
              </TableCell>
              <TableCell
                className={cn(
                  'text-right tabular-nums',
                  // Only color the delta when both sides actually have cases.
                  row.baseTotal > 0 && row.headTotal > 0 && row.headPassRate < row.basePassRate
                    ? 'text-destructive'
                    : row.baseTotal > 0 && row.headTotal > 0 && row.headPassRate > row.basePassRate
                      ? 'text-emerald-600 dark:text-emerald-400'
                      : '',
                )}
              >
                {pct(row.headPassRate, row.headTotal)}
              </TableCell>
              <TableCell
                className={cn(
                  'text-right tabular-nums',
                  row.flippedToFail > 0 ? 'text-destructive' : 'text-muted-foreground',
                )}
              >
                {row.flippedToFail}
              </TableCell>
              <TableCell
                className={cn(
                  'text-right tabular-nums',
                  row.flippedToPass > 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-muted-foreground',
                )}
              >
                {row.flippedToPass}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  )
}

type LiveFilterForm = { sampleRate: string; serviceName: string; agentName: string }

function readLiveFilter(raw: EvalDefinition['liveFilter']): LiveFilterForm {
  const f = (raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {}) as Record<string, unknown>
  return {
    sampleRate: typeof f.sampleRate === 'number' ? String(f.sampleRate) : '',
    serviceName: typeof f.serviceName === 'string' ? f.serviceName : '',
    agentName: typeof f.agentName === 'string' ? f.agentName : '',
  }
}

function buildLiveFilter(form: LiveFilterForm): LiveFilter {
  const f: NonNullable<LiveFilter> = {}
  const rate = Number(form.sampleRate)
  if (form.sampleRate.trim() && Number.isFinite(rate)) f.sampleRate = Math.min(1, Math.max(0, rate))
  if (form.serviceName.trim()) f.serviceName = form.serviceName.trim()
  if (form.agentName.trim()) f.agentName = form.agentName.trim()
  return Object.keys(f).length ? f : null
}

function describeLiveFilter(raw: EvalDefinition['liveFilter']): string {
  const f = readLiveFilter(raw)
  const parts: string[] = []
  if (f.serviceName) parts.push(`service=${f.serviceName}`)
  if (f.agentName) parts.push(`agent=${f.agentName}`)
  if (f.sampleRate && f.sampleRate !== '1') parts.push(`${Math.round(Number(f.sampleRate) * 100)}% sample`)
  return parts.length ? parts.join(' · ') : 'all traces'
}

function EditDialog({
  open,
  onOpenChange,
  definition,
  onSaved,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  definition: EvalDefinition
  onSaved: () => void | Promise<void>
}) {
  const [name, setName] = useState(definition.name)
  const [scope, setScope] = useState<EvalScope>(definition.scope)
  const [dataType, setDataType] = useState<ScoreDataType>(definition.dataType)
  const [source, setSource] = useState<EvalSourceKind>(definition.source)
  const [mode, setMode] = useState<EvalMode>(definition.mode)
  const [model, setModel] = useState(definition.model)
  const [judgePrompt, setJudgePrompt] = useState(definition.judgePrompt ?? '')
  const [filter, setFilter] = useState<LiveFilterForm>(() => readLiveFilter(definition.liveFilter))

  const mutation = useMutation({
    mutationFn: () => {
      const input: UpsertEvalDefinitionInput = {
        id: definition.id,
        name: name.trim(),
        scope,
        dataType,
        source,
        mode,
        status: definition.status,
        model: model.trim(),
        judgePrompt: source === 'llm' ? judgePrompt.trim() || null : null,
        liveFilter: mode === 'online' ? buildLiveFilter(filter) : null,
      }
      return upsertEvalDefinition({ data: input })
    },
    onSuccess: async () => {
      toast.success('Evaluator updated')
      await onSaved()
    },
    onError: (err) => toast.error(errMessage(err)),
  })

  const canSubmit = name.trim().length > 0 && !mutation.isPending

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Edit evaluator</DialogTitle>
          <DialogDescription>Changes apply to future runs of this evaluator.</DialogDescription>
        </DialogHeader>
        <form
          className="flex flex-col gap-4"
          onSubmit={(e) => {
            e.preventDefault()
            if (canSubmit) mutation.mutate()
          }}
        >
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="eval-name">Name</Label>
            <Input id="eval-name" value={name} onChange={(e) => setName(e.target.value)} autoFocus />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="eval-scope">Scope</Label>
              <Select value={scope} onValueChange={(v) => setScope(v as EvalScope)}>
                <SelectTrigger id="eval-scope">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {SCORE_TARGET_KINDS.map((k) => (
                    <SelectItem key={k} value={k} className="capitalize">
                      {k}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="eval-datatype">Data type</Label>
              <Select value={dataType} onValueChange={(v) => setDataType(v as ScoreDataType)}>
                <SelectTrigger id="eval-datatype">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {SCORE_DATA_TYPES.map((t) => (
                    <SelectItem key={t} value={t} className="capitalize">
                      {t}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="eval-source">Source</Label>
              <Select value={source} onValueChange={(v) => setSource(v as EvalSourceKind)}>
                <SelectTrigger id="eval-source">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="llm">LLM judge</SelectItem>
                  <SelectItem value="code" disabled>
                    Code (not supported yet)
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="eval-model">Model</Label>
              <ModelSelect value={model} onChange={setModel} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="eval-mode">State</Label>
              <Select value={mode} onValueChange={(v) => setMode(v as EvalMode)}>
                <SelectTrigger id="eval-mode">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="offline">Library (run on demand)</SelectItem>
                  <SelectItem value="online">Live (score production)</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          {mode === 'online' && (
            <div className="flex flex-col gap-3 rounded-lg border bg-card/40 p-3">
              <p className="text-xs text-muted-foreground">
                Which live traces this watches. Blank fields match everything.
              </p>
              <div className="grid grid-cols-3 gap-3">
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="eval-service">Service</Label>
                  <Input
                    id="eval-service"
                    value={filter.serviceName}
                    onChange={(e) => setFilter((f) => ({ ...f, serviceName: e.target.value }))}
                    placeholder="any"
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="eval-agent">Agent</Label>
                  <Input
                    id="eval-agent"
                    value={filter.agentName}
                    onChange={(e) => setFilter((f) => ({ ...f, agentName: e.target.value }))}
                    placeholder="any"
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="eval-sample">Sample rate</Label>
                  <Input
                    id="eval-sample"
                    value={filter.sampleRate}
                    onChange={(e) => setFilter((f) => ({ ...f, sampleRate: e.target.value }))}
                    placeholder="1"
                    inputMode="decimal"
                    className="tabular-nums"
                  />
                </div>
              </div>
            </div>
          )}
          {source === 'llm' && (
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="eval-judge">Judge prompt</Label>
              <Textarea
                id="eval-judge"
                value={judgePrompt}
                onChange={(e) => setJudgePrompt(e.target.value)}
                rows={6}
                placeholder="Score the response for correctness…"
                className="font-mono text-xs"
              />
            </div>
          )}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={!canSubmit}>
              {mutation.isPending ? 'Saving…' : 'Save'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
