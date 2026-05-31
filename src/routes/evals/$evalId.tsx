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
import { RelativeTime } from '#/components/relative-time'
import { Badge } from '#/components/ui/badge'
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '#/components/ui/breadcrumb'
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
import type {
  EvalCompareRow,
  EvalDefinition,
  EvalRun,
  EvalScope,
  EvalSourceKind,
  EvalStatus,
  ScoreDataType,
  UpsertEvalDefinitionInput,
} from '#/lib/evaluation'
import { EVAL_RUN_STATUS_BADGE, isEvalRunActive, SCORE_DATA_TYPES, SCORE_TARGET_KINDS } from '#/lib/evaluation'
import { formatCost } from '#/lib/format'
import { queryKeys, STALE_LIVE_MS, STALE_TELEMETRY_MS } from '#/lib/query-keys'
import { cn } from '#/lib/utils'
import {
  blessEvalRun,
  compareRuns,
  deleteEvalDefinition,
  getEvalDefinition,
  runEvalOnRecentTraces,
  setEvalDefinitionStatus,
  upsertEvalDefinition,
} from '#/server/evals'

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
  return (
    <Breadcrumb>
      <BreadcrumbList>
        <BreadcrumbItem>
          <BreadcrumbLink asChild>
            <Link to="/evals">Evals</Link>
          </BreadcrumbLink>
        </BreadcrumbItem>
        <BreadcrumbSeparator />
        <BreadcrumbItem>
          <BreadcrumbPage>{name ?? '—'}</BreadcrumbPage>
        </BreadcrumbItem>
      </BreadcrumbList>
    </Breadcrumb>
  )
}

function EvalDetailLoaded({ definition, runs }: { definition: EvalDefinition; runs: EvalRun[] }) {
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const id = definition.id
  const [editOpen, setEditOpen] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)

  const invalidateDetail = () => queryClient.invalidateQueries({ queryKey: queryKeys.evals.definition(id) })

  const statusMutation = useMutation({
    mutationFn: (status: EvalStatus) => setEvalDefinitionStatus({ data: { id, status } }),
    onSuccess: async (_data, status) => {
      await invalidateDetail()
      await queryClient.invalidateQueries({ queryKey: queryKeys.evals.definitions() })
      toast.success(status === 'paused' ? 'Evaluator paused' : 'Evaluator resumed')
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : String(err)),
  })

  const deleteMutation = useMutation({
    mutationFn: () => deleteEvalDefinition({ data: id }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.evals.all() })
      toast.success('Evaluator deleted')
      void navigate({ to: '/evals' })
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : String(err)),
  })

  const blessMutation = useMutation({
    mutationFn: (vars: { runId: number; blessed: boolean }) =>
      blessEvalRun({ data: { id: vars.runId, blessed: vars.blessed } }),
    onSuccess: async (_data, vars) => {
      await invalidateDetail()
      toast.success(vars.blessed ? 'Run blessed' : 'Run unblessed')
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : String(err)),
  })

  const runMutation = useMutation({
    mutationFn: () => runEvalOnRecentTraces({ data: { definitionId: id, limit: 10 } }),
    onSuccess: async () => {
      await invalidateDetail()
      toast.success('Run started over recent traces')
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : String(err)),
  })

  const isPaused = definition.status === 'paused'
  const canRun = definition.source === 'llm'

  return (
    <Page title={<EvalBreadcrumb name={definition.name} />}>
      <div className="flex flex-col gap-6 px-4 py-6 lg:px-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex flex-col gap-1">
            <h1 className="text-lg font-semibold">{definition.name}</h1>
            <Badge variant={isPaused ? 'warning' : 'success'} className="capitalize">
              {definition.status}
            </Badge>
          </div>
          <div className="flex items-center gap-2">
            {canRun && (
              <Button size="sm" disabled={runMutation.isPending} onClick={() => runMutation.mutate()}>
                <HugeiconsIcon icon={PlayIcon} strokeWidth={2} data-icon="inline-start" />
                {runMutation.isPending ? 'Starting…' : 'Run on recent traces'}
              </Button>
            )}
            <Button variant="outline" size="sm" onClick={() => setEditOpen(true)}>
              <HugeiconsIcon icon={PencilEdit02Icon} strokeWidth={2} data-icon="inline-start" />
              Edit
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={statusMutation.isPending}
              onClick={() => statusMutation.mutate(isPaused ? 'active' : 'paused')}
            >
              <HugeiconsIcon icon={isPaused ? PlayIcon : PauseIcon} strokeWidth={2} data-icon="inline-start" />
              {isPaused ? 'Resume' : 'Pause'}
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
      <MetaItem label="Mode">
        <span className="capitalize">{definition.mode}</span>
      </MetaItem>
      <MetaItem label="Model">
        <span className="font-mono text-xs">{definition.model || '—'}</span>
      </MetaItem>
      <MetaItem label="Version">
        <span className="tabular-nums">v{definition.version}</span>
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
        No runs yet. Use “Run on recent traces”, or run this evaluator over a dataset from the dataset page.
      </div>
    )
  }

  return (
    <div className="rounded-lg border bg-background">
      <Table>
        <TableHeader className="bg-muted/40 [&_th]:font-normal [&_th]:text-muted-foreground">
          <TableRow>
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
              <TableRow key={run.id}>
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
    <div className="rounded-lg border bg-background">
      <Table>
        <TableHeader className="bg-muted/40 [&_th]:font-normal [&_th]:text-muted-foreground">
          <TableRow>
            <TableHead>Dimension</TableHead>
            <TableHead className="text-right">Base pass%</TableHead>
            <TableHead className="text-right">Head pass%</TableHead>
            <TableHead className="text-right">→ fail</TableHead>
            <TableHead className="text-right">→ pass</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row) => (
            <TableRow key={row.name}>
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
  const [model, setModel] = useState(definition.model)
  const [judgePrompt, setJudgePrompt] = useState(definition.judgePrompt ?? '')

  const mutation = useMutation({
    mutationFn: () => {
      const input: UpsertEvalDefinitionInput = {
        id: definition.id,
        name: name.trim(),
        scope,
        dataType,
        source,
        model: model.trim(),
        judgePrompt: source === 'llm' ? judgePrompt.trim() || null : null,
      }
      return upsertEvalDefinition({ data: input })
    },
    onSuccess: async () => {
      toast.success('Evaluator updated')
      await onSaved()
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : String(err)),
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
              <Input
                id="eval-model"
                value={model}
                onChange={(e) => setModel(e.target.value)}
                placeholder="gpt-4o-mini"
                className="font-mono text-xs"
              />
            </div>
          </div>
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
