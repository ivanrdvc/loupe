import {
  Add01Icon,
  Alert02Icon,
  AlertCircleIcon,
  ChatQuestion01Icon,
  CheckmarkCircle02Icon,
  Delete02Icon,
  Download01Icon,
  Link01Icon,
  PlayCircleIcon,
  SlidersHorizontalIcon,
} from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { createFileRoute, Link } from '@tanstack/react-router'
import type { ColumnDef } from '@tanstack/react-table'
import { useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'
import { Page } from '#/components/page'
import { PageBreadcrumb } from '#/components/page-breadcrumb'
import { Badge } from '#/components/ui/badge'
import { Button } from '#/components/ui/button'
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '#/components/ui/empty'
import { Input } from '#/components/ui/input'
import { Label } from '#/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '#/components/ui/select'
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from '#/components/ui/sheet'
import { Skeleton } from '#/components/ui/skeleton'
import { Switch } from '#/components/ui/switch'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '#/components/ui/tabs'
import { Textarea } from '#/components/ui/textarea'
import { Tooltip, TooltipContent, TooltipTrigger } from '#/components/ui/tooltip'
import { judgeDatasetRun } from '#/features/evaluation/server/dataset-judge'
import { deleteExamples, runDataset, updateDataset, upsertExample } from '#/features/evaluation/server/datasets'
import { getJudgeDefaults, listEvalDefinitions } from '#/features/evaluation/server/evals'
import type { EvalDefinition } from '#/lib/eval/evaluation'
import { errMessage } from '#/lib/format'
import { looksLikeJson as isJsonShape, parseJson } from '#/lib/json'
import { queryKeys, STALE_TELEMETRY_MS } from '#/lib/query-keys'
import { cn } from '#/lib/utils'
import { DataGrid } from './-components/data-grid'
import {
  type AgentOverrides,
  type ChatMessage,
  type ChatRole,
  type DatasetDetail,
  type DatasetExample,
  type DatasetRun,
  type DatasetRunItem,
  datasetDetailQuery,
  datasetRunDefaultsQuery,
  type ExampleInput,
  GLOBAL_DEFAULT_ENDPOINT,
  type ItemScore,
  inputPreview,
  inputTurns,
  type RunItemStatus,
  type ToolDecl,
} from './-data'

export const Route = createFileRoute('/datasets/$datasetId')({
  loader: ({ context, params }) =>
    Promise.all([
      context.queryClient.ensureQueryData(datasetDetailQuery(params.datasetId)),
      context.queryClient.ensureQueryData(datasetRunDefaultsQuery()),
    ]),
  component: DatasetDetailPage,
})

function DatasetDetailPage() {
  const { datasetId } = Route.useParams()
  const { data: detail, isLoading } = useQuery(datasetDetailQuery(datasetId))

  if (isLoading) {
    return (
      <Page title={<DatasetBreadcrumb />}>
        <div className="flex flex-col gap-4 px-4 py-4 lg:px-6">
          <Skeleton className="h-6 w-48" />
          <Skeleton className="h-40 w-full" />
        </div>
      </Page>
    )
  }

  if (!detail) {
    return (
      <Page title={<DatasetBreadcrumb />}>
        <div className="px-4 lg:px-6">
          <Empty>
            <EmptyHeader>
              <EmptyMedia variant="icon" />
              <EmptyTitle>Dataset not found</EmptyTitle>
              <EmptyDescription>This dataset may have been deleted.</EmptyDescription>
            </EmptyHeader>
          </Empty>
        </div>
      </Page>
    )
  }

  return <DatasetDetailLoaded detail={detail} />
}

function DatasetBreadcrumb({ name }: { name?: string }) {
  return <PageBreadcrumb crumbs={[{ label: 'Datasets', to: '/datasets' }, { label: name ?? '—' }]} />
}

function DatasetDetailLoaded({ detail }: { detail: DatasetDetail }) {
  const { dataset, examples, runs, items } = detail
  const queryClient = useQueryClient()
  const { data: runDefaults } = useQuery(datasetRunDefaultsQuery())
  const [tab, setTab] = useState('examples')
  const [activeExample, setActiveExample] = useState<DatasetExample | null>(null)
  const [creating, setCreating] = useState(false)
  const [activeItem, setActiveItem] = useState<DatasetRunItem | null>(null)
  const [endpoint, setEndpoint] = useState(dataset.endpointOverride ?? runDefaults?.endpointUrl ?? '')
  const [overrides, setOverrides] = useState<AgentOverrides>({})
  const latestId = runs[0]?.id ?? null
  const [selectedIds, setSelectedIds] = useState<string[]>(latestId ? [latestId] : [])

  const [judgeDefId, setJudgeDefId] = useState('default')
  const [autoJudge, setAutoJudge] = useState(false)
  useEffect(() => {
    setAutoJudge(window.localStorage.getItem('datasets:autoJudge') === '1')
  }, [])
  const changeAutoJudge = (v: boolean) => {
    setAutoJudge(v)
    window.localStorage.setItem('datasets:autoJudge', v ? '1' : '0')
  }
  const { data: judgeDefaults } = useQuery({
    queryKey: queryKeys.evals.judgeDefaults(),
    queryFn: () => getJudgeDefaults(),
    staleTime: STALE_TELEMETRY_MS,
  })
  const { data: evaluators = [] } = useQuery({
    queryKey: queryKeys.evals.definitions(),
    queryFn: () => listEvalDefinitions({ data: {} }),
    staleTime: STALE_TELEMETRY_MS,
  })
  const judgeRunId = selectedIds[0] ?? latestId

  const invalidate = () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: queryKeys.datasets.detail(dataset.id) }),
      queryClient.invalidateQueries({ queryKey: queryKeys.datasets.list() }),
    ])

  const judgeMutation = useMutation({
    mutationFn: (runId: string) =>
      judgeDatasetRun({
        data: { runId: Number(runId), definitionId: judgeDefId !== 'default' ? Number(judgeDefId) : undefined },
      }),
    onSuccess: async (result) => {
      await invalidate()
      const rate = result.passRate != null ? `${Math.round(result.passRate * 100)}% pass` : `${result.judged} judged`
      toast.success(`Scored ${result.judged} answers · ${rate}`)
    },
    onError: (err) => toast.error(errMessage(err)),
  })

  const onRunSuccess = async (runId: string, message: string) => {
    await invalidate()
    setSelectedIds([runId])
    setTab('runs')
    toast.success(message)
    if (autoJudge && judgeDefaults?.configured) judgeMutation.mutate(runId)
  }

  const runMutation = useMutation({
    mutationFn: () =>
      runDataset({ data: { datasetId: dataset.id, endpointUrl: endpoint.trim() || undefined, overrides } }),
    onSuccess: ({ runId }) => onRunSuccess(runId, 'Run complete'),
    onError: (err) => toast.error(errMessage(err)),
  })

  const [runningExampleId, setRunningExampleId] = useState<string | null>(null)
  const runExampleMutation = useMutation({
    mutationFn: (exampleId: string) =>
      runDataset({
        data: { datasetId: dataset.id, endpointUrl: endpoint.trim() || undefined, exampleIds: [exampleId], overrides },
      }),
    onMutate: (exampleId) => setRunningExampleId(exampleId),
    onSuccess: ({ runId }) => onRunSuccess(runId, 'Example run complete'),
    onError: (err) => toast.error(errMessage(err)),
    onSettled: () => setRunningExampleId(null),
  })

  const persistEndpoint = useMutation({
    mutationFn: (url: string) =>
      updateDataset({ data: { datasetId: dataset.id, endpointOverride: url.trim() || null } }),
    onSuccess: () => invalidate(),
  })
  const commitEndpoint = () => {
    if ((dataset.endpointOverride ?? '') !== endpoint.trim()) persistEndpoint.mutate(endpoint)
  }

  const itemFor = (runId: string, exampleId: string) =>
    items.find((it) => it.runId === runId && it.exampleId === exampleId) ?? null

  const closeSheet = () => {
    setActiveExample(null)
    setCreating(false)
  }

  return (
    <Page title={<DatasetBreadcrumb name={dataset.name} />}>
      <div className="flex min-h-0 flex-1 flex-col">
        {/* header meta row */}
        <div className="flex flex-wrap items-center gap-3 border-b px-4 py-3 lg:px-6">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium">{dataset.name}</span>
            {dataset.tags.map((t) => (
              <Badge key={t} variant="outline">
                {t}
              </Badge>
            ))}
          </div>
          <div className="ml-auto flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => downloadCsv(dataset.name, examples)}>
              <HugeiconsIcon icon={Download01Icon} strokeWidth={2} data-icon="inline-start" />
              CSV
            </Button>
          </div>
        </div>

        <Tabs value={tab} onValueChange={setTab} className="flex min-h-0 flex-1 flex-col gap-0">
          <div className="border-b pt-3">
            <TabsList variant="line" className="h-auto gap-x-4 px-4 lg:px-6">
              <TabsTrigger value="examples" className="flex-none px-3 pb-2">
                Examples <span className="ml-1 font-mono text-muted-foreground">{examples.length}</span>
              </TabsTrigger>
              <TabsTrigger value="runs" className="flex-none px-3 pb-2">
                Runs <span className="ml-1 font-mono text-muted-foreground">{runs.length}</span>
              </TabsTrigger>
            </TabsList>
          </div>

          <TabsContent value="examples" className="min-h-0 flex-1">
            <ExamplesTab
              examples={examples}
              latestRunId={latestId}
              itemFor={itemFor}
              onRun={(e) => runExampleMutation.mutate(e.id)}
              runningId={runningExampleId}
              onOpen={(e) => {
                setCreating(false)
                setActiveExample(e)
              }}
              onAdd={() => {
                setActiveExample(null)
                setCreating(true)
              }}
            />
          </TabsContent>

          <TabsContent value="runs" className="min-h-0 flex-1">
            <RunsTab
              detail={detail}
              endpoint={endpoint}
              onEndpointChange={setEndpoint}
              onEndpointCommit={commitEndpoint}
              selectedIds={selectedIds}
              onSelectedChange={setSelectedIds}
              itemFor={itemFor}
              onOpenItem={setActiveItem}
              onRun={() => runMutation.mutate()}
              running={runMutation.isPending}
              overrides={overrides}
              onOverridesChange={setOverrides}
              evaluators={evaluators}
              judgeDefId={judgeDefId}
              onJudgeDefChange={setJudgeDefId}
              autoJudge={autoJudge}
              onAutoJudgeChange={changeAutoJudge}
              judgeConfigured={!!judgeDefaults?.configured}
              judgeRunId={judgeRunId}
              judging={judgeMutation.isPending}
              onJudge={() => judgeRunId && judgeMutation.mutate(judgeRunId)}
            />
          </TabsContent>
        </Tabs>
      </div>

      {(activeExample || creating) && (
        <ExampleSheet
          key={activeExample?.id ?? 'new'}
          datasetId={dataset.id}
          example={activeExample}
          onClose={closeSheet}
          onSaved={async () => {
            await invalidate()
            closeSheet()
          }}
        />
      )}
      <ResultSheet
        item={activeItem}
        example={activeItem ? (examples.find((e) => e.id === activeItem.exampleId) ?? null) : null}
        onClose={() => setActiveItem(null)}
      />
    </Page>
  )
}

function ExamplesTab({
  examples,
  latestRunId,
  itemFor,
  onRun,
  runningId,
  onOpen,
  onAdd,
}: {
  examples: DatasetExample[]
  latestRunId: string | null
  itemFor: (runId: string, exampleId: string) => DatasetRunItem | null
  onRun: (e: DatasetExample) => void
  runningId: string | null
  onOpen: (e: DatasetExample) => void
  onAdd: () => void
}) {
  const columns = useMemo<ColumnDef<DatasetExample, unknown>[]>(
    () => [
      {
        id: 'input',
        header: 'Input (question)',
        cell: ({ row }) => <InputCell example={row.original} clamp={2} />,
        meta: { className: 'max-w-xs' },
      },
      {
        id: 'expected',
        header: 'Expected',
        cell: ({ row }) =>
          row.original.expected ? (
            <span className="line-clamp-2 text-muted-foreground">{row.original.expected}</span>
          ) : (
            <span className="text-xs italic text-muted-foreground/60">click to add</span>
          ),
        meta: { className: 'max-w-xs' },
      },
      {
        id: 'metadata',
        header: 'Metadata',
        cell: ({ row }) => (
          <div className="flex flex-wrap gap-1">
            {Object.entries(row.original.metadata).map(([k, v]) => (
              <Badge key={k} variant="secondary" className="font-mono text-[10px]">
                {k}:{v}
              </Badge>
            ))}
          </div>
        ),
        meta: { headClassName: 'w-40' },
      },
      {
        id: 'lastRun',
        header: 'Last run',
        cell: ({ row }) => {
          const last = latestRunId ? itemFor(latestRunId, row.original.id) : null
          return last ? (
            <div className="flex min-w-0 items-center gap-1.5">
              <StatusIcon status={last.status} />
              <span className="truncate text-xs text-muted-foreground">{last.output}</span>
            </div>
          ) : (
            <span className="text-xs text-muted-foreground/60">—</span>
          )
        },
        meta: { headClassName: 'w-56', className: 'max-w-xs' },
      },
      {
        id: 'run',
        header: 'Run',
        cell: ({ row }) => (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="size-7 text-muted-foreground hover:text-foreground"
                disabled={runningId === row.original.id}
                onClick={(e) => {
                  e.stopPropagation()
                  onRun(row.original)
                }}
              >
                <HugeiconsIcon icon={PlayCircleIcon} strokeWidth={2} />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Run just this example</TooltipContent>
          </Tooltip>
        ),
        meta: { headClassName: 'w-12' },
      },
    ],
    [latestRunId, itemFor, onRun, runningId],
  )

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {examples.length > 0 && (
        <div className="flex items-center justify-between px-4 py-3 lg:px-6">
          <p className="text-xs text-muted-foreground">
            The questions. Edit input / expected / metadata here — that's what every run is graded against.
          </p>
          <Button size="sm" variant="outline" onClick={onAdd}>
            <HugeiconsIcon icon={Add01Icon} strokeWidth={2} data-icon="inline-start" />
            Example
          </Button>
        </div>
      )}
      {examples.length === 0 ? (
        <div className="px-4 lg:px-6">
          <Empty>
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <HugeiconsIcon icon={ChatQuestion01Icon} strokeWidth={2} />
              </EmptyMedia>
              <EmptyTitle>No examples yet</EmptyTitle>
              <EmptyDescription>Add a question by hand, or capture one from a trace.</EmptyDescription>
            </EmptyHeader>
            <EmptyContent>
              <Button size="sm" onClick={onAdd}>
                <HugeiconsIcon icon={Add01Icon} strokeWidth={2} data-icon="inline-start" />
                Add example
              </Button>
            </EmptyContent>
          </Empty>
        </div>
      ) : (
        <DataGrid columns={columns} data={examples} getRowId={(e) => e.id} onRowClick={onOpen} />
      )}
    </div>
  )
}

function RunsTab({
  detail,
  endpoint,
  onEndpointChange,
  onEndpointCommit,
  selectedIds,
  onSelectedChange,
  itemFor,
  onOpenItem,
  onRun,
  running,
  overrides,
  onOverridesChange,
  evaluators,
  judgeDefId,
  onJudgeDefChange,
  autoJudge,
  onAutoJudgeChange,
  judgeConfigured,
  judgeRunId,
  judging,
  onJudge,
}: {
  detail: DatasetDetail
  endpoint: string
  onEndpointChange: (v: string) => void
  onEndpointCommit: () => void
  selectedIds: string[]
  onSelectedChange: (ids: string[]) => void
  itemFor: (runId: string, exampleId: string) => DatasetRunItem | null
  onOpenItem: (it: DatasetRunItem) => void
  onRun: () => void
  running: boolean
  overrides: AgentOverrides
  onOverridesChange: (o: AgentOverrides) => void
  evaluators: EvalDefinition[]
  judgeDefId: string
  onJudgeDefChange: (v: string) => void
  autoJudge: boolean
  onAutoJudgeChange: (v: boolean) => void
  judgeConfigured: boolean
  judgeRunId: string | null
  judging: boolean
  onJudge: () => void
}) {
  const { examples, runs } = detail
  const [overridesOpen, setOverridesOpen] = useState(false)
  const overrideCount = countOverrides(overrides)

  // Keep focus-first order so compare lays the second run beside it.
  const selectedRuns = selectedIds.map((id) => runs.find((r) => r.id === id)).filter((r): r is DatasetRun => !!r)

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {/* Call my agent bar */}
      <div className="mx-4 mt-4 mb-3 flex flex-wrap items-center gap-2 rounded-lg border bg-card/40 px-3 py-2 lg:mx-6">
        <Label htmlFor="ds-endpoint" className="text-xs whitespace-nowrap text-muted-foreground">
          Call my agent
        </Label>
        <Input
          id="ds-endpoint"
          value={endpoint}
          onChange={(e) => onEndpointChange(e.target.value)}
          onBlur={onEndpointCommit}
          placeholder={GLOBAL_DEFAULT_ENDPOINT}
          className="h-8 max-w-sm font-mono text-xs"
        />
        <Button variant="outline" size="sm" onClick={() => setOverridesOpen(true)}>
          <HugeiconsIcon icon={SlidersHorizontalIcon} strokeWidth={2} data-icon="inline-start" />
          Overrides
          {overrideCount > 0 && (
            <Badge variant="secondary" className="ml-1 font-mono text-[10px]">
              {overrideCount}
            </Badge>
          )}
        </Button>
        <Select value={judgeDefId} onValueChange={onJudgeDefChange}>
          <SelectTrigger size="sm" className="w-44" aria-label="Judge">
            <SelectValue placeholder="Default correctness" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="default">Default correctness</SelectItem>
            {evaluators
              .filter((e) => e.source === 'llm')
              .map((e) => (
                <SelectItem key={e.id} value={String(e.id)}>
                  {e.name}
                </SelectItem>
              ))}
          </SelectContent>
        </Select>
        <Tooltip>
          <TooltipTrigger asChild>
            <span>
              <Button
                variant="outline"
                size="sm"
                disabled={!judgeRunId || !judgeConfigured || judging}
                onClick={onJudge}
              >
                {judging ? 'Judging…' : 'Judge'}
              </Button>
            </span>
          </TooltipTrigger>
          {!judgeConfigured && (
            <TooltipContent>Set OPENAI_API_KEY or ANTHROPIC_API_KEY to enable judging</TooltipContent>
          )}
        </Tooltip>
        <Tooltip>
          <TooltipTrigger asChild>
            <label
              htmlFor="auto-judge"
              className="flex items-center gap-1.5 text-xs whitespace-nowrap text-muted-foreground"
            >
              <Switch
                id="auto-judge"
                checked={autoJudge}
                onCheckedChange={onAutoJudgeChange}
                disabled={!judgeConfigured}
              />
              Auto-judge
            </label>
          </TooltipTrigger>
          <TooltipContent>Judge automatically after each run</TooltipContent>
        </Tooltip>
        <Button className="ml-auto" size="sm" onClick={onRun} disabled={running || examples.length === 0}>
          <HugeiconsIcon icon={PlayCircleIcon} strokeWidth={2} data-icon="inline-start" />
          {running ? 'Running…' : 'Run on all'}
        </Button>
      </div>

      <AgentOverridesDrawer
        open={overridesOpen}
        onClose={() => setOverridesOpen(false)}
        overrides={overrides}
        onChange={onOverridesChange}
      />

      {runs.length === 0 ? (
        <div className="px-4 lg:px-6">
          <Empty>
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <HugeiconsIcon icon={PlayCircleIcon} strokeWidth={2} />
              </EmptyMedia>
              <EmptyTitle>No runs yet</EmptyTitle>
              <EmptyDescription>Point at your agent and hit “Run on all” to fire every question.</EmptyDescription>
            </EmptyHeader>
          </Empty>
        </div>
      ) : (
        <>
          <RunControls runs={runs} selectedIds={selectedIds} onSelectedChange={onSelectedChange} />
          {selectedRuns.length > 1 ? (
            <RunResultsGrid runs={selectedRuns} examples={examples} itemFor={itemFor} onOpenItem={onOpenItem} />
          ) : (
            <SingleRunList
              run={selectedRuns[0] ?? null}
              examples={examples}
              itemFor={itemFor}
              onOpenItem={onOpenItem}
            />
          )}
        </>
      )}
    </div>
  )
}

// One focused run (latest by default) + an optional second run to compare against.
function RunControls({
  runs,
  selectedIds,
  onSelectedChange,
}: {
  runs: DatasetRun[]
  selectedIds: string[]
  onSelectedChange: (ids: string[]) => void
}) {
  const latestId = runs[0]?.id ?? null
  const focusId = selectedIds[0] ?? latestId
  const compareId = selectedIds[1] ?? null
  const focus = runs.find((r) => r.id === focusId)

  const setFocus = (id: string) => onSelectedChange(compareId && compareId !== id ? [id, compareId] : [id])
  const setCompare = (id: string) => onSelectedChange(id === 'none' || !focusId ? [focusId as string] : [focusId, id])

  const label = (run: DatasetRun) =>
    `${run.label}${run.id === latestId ? ' · latest' : ''}${run.passRate != null ? ` · ${Math.round(run.passRate * 100)}%` : ''}`

  return (
    <div className="flex flex-wrap items-center gap-2 px-4 pb-3 lg:px-6">
      <span className="text-xs text-muted-foreground">Run</span>
      <Select value={focusId ?? undefined} onValueChange={setFocus}>
        <SelectTrigger size="sm" className="h-8 w-56 font-mono text-xs">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {runs.map((run) => (
            <SelectItem key={run.id} value={run.id} className="font-mono text-xs">
              {label(run)}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Select value={compareId ?? 'none'} onValueChange={setCompare}>
        <SelectTrigger size="sm" className="h-8 w-48 text-xs">
          <SelectValue placeholder="Compare…" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="none">No compare</SelectItem>
          {runs
            .filter((r) => r.id !== focusId)
            .map((run) => (
              <SelectItem key={run.id} value={run.id} className="font-mono text-xs">
                vs {label(run)}
              </SelectItem>
            ))}
        </SelectContent>
      </Select>
      {focus?.passRate != null && (
        <span className="text-xs text-muted-foreground">{Math.round(focus.passRate * 100)}% pass</span>
      )}
    </div>
  )
}

function ScoreChip({ s }: { s: ItemScore }) {
  const verdict =
    s.pass === true ? 'pass' : s.pass === false ? 'fail' : (s.label ?? (s.value != null ? String(s.value) : '—'))
  return (
    <Badge
      variant="outline"
      title={s.explanation ?? undefined}
      className={cn(
        'gap-1 font-normal',
        s.pass === true && 'border-emerald-600/40 text-emerald-600',
        s.pass === false && 'border-destructive/40 text-destructive',
        s.pass == null && 'text-muted-foreground',
      )}
    >
      <span className="text-muted-foreground">{s.name}</span>
      {verdict}
    </Badge>
  )
}

function ScoreChips({ it }: { it: DatasetRunItem | null }) {
  if (!it) return null
  if (it.scores.length === 0)
    return <span className="text-[10px] text-muted-foreground">{it.status === 'error' ? '—' : 'not judged'}</span>
  return (
    <div className="flex flex-wrap items-center justify-end gap-1">
      {it.scores.map((s) => (
        <ScoreChip key={s.name} s={s} />
      ))}
    </div>
  )
}

// Default single-run view: one readable row per example (question · answer · score).
function SingleRunList({
  run,
  examples,
  itemFor,
  onOpenItem,
}: {
  run: DatasetRun | null
  examples: DatasetExample[]
  itemFor: (runId: string, exampleId: string) => DatasetRunItem | null
  onOpenItem: (it: DatasetRunItem) => void
}) {
  return (
    <div className="min-h-0 flex-1 overflow-auto px-4 pb-4 lg:px-6">
      <ul className="flex flex-col divide-y rounded-lg border">
        {examples.map((ex) => {
          const it = run ? itemFor(run.id, ex.id) : null
          return (
            <li key={ex.id}>
              <button
                type="button"
                disabled={!it}
                onClick={() => it && onOpenItem(it)}
                className="flex w-full items-start gap-3 px-3 py-2.5 text-left hover:bg-muted/50 disabled:cursor-default disabled:hover:bg-transparent"
              >
                <div className="min-w-0 flex-1">
                  <p className="line-clamp-1 text-sm">{inputPreview(ex.input)}</p>
                  {it?.status === 'error' ? (
                    <p className="text-xs text-destructive">⚠ run failed</p>
                  ) : it ? (
                    <p className="line-clamp-2 text-xs text-muted-foreground">{it.output}</p>
                  ) : (
                    <p className="text-xs text-muted-foreground/60">not in this run</p>
                  )}
                </div>
                {it && <StatusIcon status={it.status} />}
                <ScoreChips it={it} />
              </button>
            </li>
          )
        })}
      </ul>
    </div>
  )
}

// Results for the selected run(s): one Output column per run (1 = focus, 2+ = compare).
function RunResultsGrid({
  runs,
  examples,
  itemFor,
  onOpenItem,
}: {
  runs: DatasetRun[]
  examples: DatasetExample[]
  itemFor: (runId: string, exampleId: string) => DatasetRunItem | null
  onOpenItem: (it: DatasetRunItem) => void
}) {
  const columns: ColumnDef<DatasetExample, unknown>[] = [
    {
      id: 'input',
      header: 'Input',
      cell: ({ row }) => <InputCell example={row.original} />,
      meta: {
        headClassName: 'sticky left-0 z-20 w-64 bg-muted/40',
        className: 'sticky left-0 z-10 w-64 bg-background',
      },
    },
    {
      id: 'expected',
      header: 'Expected',
      cell: ({ row }) => (
        <span className="line-clamp-3 text-xs text-muted-foreground">{row.original.expected ?? '—'}</span>
      ),
      meta: { headClassName: 'w-56' },
    },
    ...runs.map(
      (run): ColumnDef<DatasetExample, unknown> => ({
        id: run.id,
        header: () => (
          <div className="flex flex-col gap-0.5 py-1">
            <span className="font-mono text-xs text-foreground">{run.label}</span>
            {run.passRate != null && (
              <span className="text-[10px] text-muted-foreground">{Math.round(run.passRate * 100)}% pass</span>
            )}
          </div>
        ),
        cell: ({ row }) => <OutputCell it={itemFor(run.id, row.original.id)} onOpenItem={onOpenItem} />,
        meta: { headClassName: 'w-80' },
      }),
    ),
  ]

  return (
    <>
      <DataGrid columns={columns} data={examples} getRowId={(e) => e.id} />
      <p className="px-4 py-2 text-[11px] text-muted-foreground lg:px-6">
        {runs.length > 1 && '⚠ = answer changed vs previous run · '}click any cell for the full answer + trace · use
        Judge to score the selected run
      </p>
    </>
  )
}

function InputCell({ example, clamp = 3 }: { example: DatasetExample; clamp?: 2 | 3 }) {
  return (
    <>
      {inputTurns(example.input) && (
        <Badge variant="secondary" className="mb-1 text-[10px]">
          {inputTurns(example.input)?.length} turns
        </Badge>
      )}
      <span className={cn('text-sm', clamp === 2 ? 'line-clamp-2' : 'line-clamp-3')}>
        {inputPreview(example.input)}
      </span>
    </>
  )
}

function OutputCell({ it, onOpenItem }: { it: DatasetRunItem | null; onOpenItem: (it: DatasetRunItem) => void }) {
  if (!it) return <span className="text-xs text-muted-foreground/50">—</span>
  return (
    <button
      type="button"
      className="flex w-full flex-col gap-1 rounded-md p-1 text-left hover:bg-muted/50"
      onClick={() => onOpenItem(it)}
    >
      <span className="line-clamp-3 text-xs">{it.status === 'error' ? '⚠ run failed' : it.output}</span>
      {it.scores.length > 0 && (
        <div className="flex flex-wrap items-center gap-1">
          {it.scores.map((s) => (
            <ScoreChip key={s.name} s={s} />
          ))}
        </div>
      )}
      <span className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
        <StatusIcon status={it.status} />
        {it.status === 'changed' && <span className="text-warning">changed</span>}
        <span>· {(it.latencyMs / 1000).toFixed(1)}s</span>
        {it.traceId && <HugeiconsIcon icon={Link01Icon} className="size-3" strokeWidth={2} />}
      </span>
    </button>
  )
}

function StatusIcon({ status }: { status: RunItemStatus }) {
  if (status === 'ok')
    return <HugeiconsIcon icon={CheckmarkCircle02Icon} className="size-3.5 text-success" strokeWidth={2} />
  if (status === 'changed')
    return <HugeiconsIcon icon={Alert02Icon} className="size-3.5 text-warning" strokeWidth={2} />
  if (status === 'error')
    return <HugeiconsIcon icon={AlertCircleIcon} className="size-3.5 text-destructive" strokeWidth={2} />
  return <span className="inline-block size-2 rounded-full bg-muted-foreground/40" />
}

const isValidJson = (s: string) => parseJson(s) !== undefined
// Default an example's Expected to JSON mode only when it already holds a JSON object/array.
const looksLikeJson = (s: string | null | undefined) => {
  const t = (s ?? '').trim()
  return isJsonShape(t) && isValidJson(t)
}

function ExampleSheet({
  datasetId,
  example,
  onClose,
  onSaved,
}: {
  datasetId: string
  example: DatasetExample | null
  onClose: () => void
  onSaved: () => void | Promise<void>
}) {
  const [input, setInput] = useState<ExampleInput>(example?.input ?? '')
  const [expected, setExpected] = useState(example?.expected ?? '')
  const [expectedMode, setExpectedMode] = useState<'text' | 'json'>(() =>
    looksLikeJson(example?.expected) ? 'json' : 'text',
  )
  const [metaPairs, setMetaPairs] = useState<Array<[string, string]>>(Object.entries(example?.metadata ?? {}))
  const [inputValid, setInputValid] = useState(true)

  const saveMutation = useMutation({
    mutationFn: () => {
      const metadata: Record<string, string> = {}
      for (const [k, v] of metaPairs) if (k.trim()) metadata[k.trim()] = v
      return upsertExample({
        data: {
          datasetId,
          exampleId: example?.id ?? null,
          input,
          expected: expected.trim() ? expected : null,
          metadata,
          sourceTraceId: example?.sourceTraceId ?? null,
        },
      })
    },
    onSuccess: async () => {
      toast.success(example ? 'Example saved' : 'Example added')
      await onSaved()
    },
    onError: (err) => toast.error(errMessage(err)),
  })

  const deleteMutation = useMutation({
    mutationFn: () => deleteExamples({ data: { datasetId, exampleIds: example ? [example.id] : [] } }),
    onSuccess: async () => {
      toast.success('Example deleted')
      await onSaved()
    },
    onError: (err) => toast.error(errMessage(err)),
  })

  const jsonInvalid = expectedMode === 'json' && expected.trim().length > 0 && !isValidJson(expected)
  const switchToJson = () => {
    setExpectedMode('json')
    const t = expected.trim()
    if (t && isValidJson(t)) setExpected(JSON.stringify(JSON.parse(t), null, 2))
  }

  return (
    <Sheet open onOpenChange={(o) => !o && onClose()}>
      <SheetContent className="flex w-full flex-col gap-0 data-[side=right]:w-[46rem] data-[side=right]:sm:max-w-[46rem]">
        <SheetHeader>
          <SheetTitle>{example ? 'Example' : 'New example'}</SheetTitle>
          <SheetDescription>
            Edit the question and its expected answer. Filling Expected makes it golden.
          </SheetDescription>
        </SheetHeader>
        <div className="flex flex-1 flex-col gap-4 overflow-auto px-4 py-2">
          <Field label="Input">
            <InputEditor input={input} onChange={setInput} onValidChange={setInputValid} />
          </Field>
          <Field label="Expected">
            <div className="flex items-center gap-1">
              <Button
                type="button"
                size="sm"
                variant={expectedMode === 'text' ? 'secondary' : 'ghost'}
                onClick={() => setExpectedMode('text')}
              >
                Text
              </Button>
              <Button
                type="button"
                size="sm"
                variant={expectedMode === 'json' ? 'secondary' : 'ghost'}
                onClick={switchToJson}
              >
                JSON
              </Button>
            </div>
            <Textarea
              value={expected}
              onChange={(e) => setExpected(e.target.value)}
              rows={expectedMode === 'json' ? 14 : 3}
              className={cn(jsonInvalid && 'border-destructive', expectedMode === 'json' && 'font-mono text-xs')}
              placeholder={
                expectedMode === 'json'
                  ? '{ "criterion": "mentions the 30-day window" }'
                  : 'Reference answer, a tool-call assertion, or a judge rubric…'
              }
            />
            {jsonInvalid ? (
              <p className="text-[11px] text-destructive">Invalid JSON — fix it or switch to Text.</p>
            ) : (
              <p className="text-[11px] text-muted-foreground">
                A criterion checked by the judge (not an exact string match). Text or JSON — both are passed to the
                judge as the reference.
              </p>
            )}
          </Field>
          <Field label="Metadata">
            <MetadataEditor pairs={metaPairs} onChange={setMetaPairs} />
          </Field>
          {example?.sourceTraceId && (
            <Field label="Source">
              <Link
                to="/traces/$traceId"
                params={{ traceId: example.sourceTraceId }}
                className="inline-flex items-center gap-1 font-mono text-xs text-primary hover:underline"
              >
                trace {example.sourceTraceId}
                <HugeiconsIcon icon={Link01Icon} className="size-3" strokeWidth={2} />
              </Link>
            </Field>
          )}
        </div>
        <SheetFooter>
          <div className="flex items-center gap-2">
            <Button
              onClick={() => saveMutation.mutate()}
              disabled={saveMutation.isPending || jsonInvalid || !inputValid}
            >
              Save
            </Button>
            <SheetClose asChild>
              <Button variant="outline">Cancel</Button>
            </SheetClose>
            {example && (
              <Button
                variant="ghost"
                size="icon"
                aria-label="Delete example"
                className="ml-auto text-muted-foreground hover:text-destructive"
                disabled={deleteMutation.isPending}
                onClick={() => deleteMutation.mutate()}
              >
                <HugeiconsIcon icon={Delete02Icon} strokeWidth={2} />
              </Button>
            )}
          </div>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  )
}

function ResultSheet({
  item,
  example,
  onClose,
}: {
  item: DatasetRunItem | null
  example: DatasetExample | null
  onClose: () => void
}) {
  return (
    <Sheet open={!!item} onOpenChange={(o) => !o && onClose()}>
      <SheetContent className="flex w-full flex-col gap-0 sm:max-w-md">
        <SheetHeader>
          <SheetTitle>Run result</SheetTitle>
          <SheetDescription>One example, one run.</SheetDescription>
        </SheetHeader>
        {item && (
          <div className="flex flex-1 flex-col gap-4 overflow-auto px-4 py-2 text-sm">
            <Field label="Input">
              {(() => {
                const turns = inputTurns(example?.input ?? '')
                return turns ? <TranscriptView turns={turns} /> : <p>{inputPreview(example?.input ?? '')}</p>
              })()}
            </Field>
            <Field label="Expected">
              <p className="text-muted-foreground">{example?.expected ?? '—'}</p>
            </Field>
            <Field label="Answer">
              <p className="rounded-md border bg-card/40 p-2">
                {item.status === 'error' ? '— (run failed)' : item.output}
              </p>
            </Field>
            <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
              <StatusIcon status={item.status} />
              <span>{(item.latencyMs / 1000).toFixed(1)}s</span>
              <span>· {item.tokens} tok</span>
            </div>
            {item.traceId && (
              <Field label="Trace">
                <Link
                  to="/traces/$traceId"
                  params={{ traceId: item.traceId }}
                  className="inline-flex items-center gap-1 font-mono text-xs text-primary hover:underline"
                >
                  open trace {item.traceId}
                  <HugeiconsIcon icon={Link01Icon} className="size-3" strokeWidth={2} />
                </Link>
              </Field>
            )}
            <Field label="Score">
              {item.status === 'error' ? (
                <span className="text-xs text-muted-foreground">—</span>
              ) : (
                <ScoreChips it={item} />
              )}
            </Field>
          </div>
        )}
        <SheetFooter>
          <SheetClose asChild>
            <Button variant="outline">Close</Button>
          </SheetClose>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  )
}

const ROLE_STYLE: Record<ChatMessage['role'], string> = {
  system: 'text-muted-foreground',
  user: 'text-foreground',
  assistant: 'text-primary',
  tool: 'text-warning',
}

const CHAT_ROLES: ChatRole[] = ['system', 'user', 'assistant', 'tool']

function isMessageArray(v: unknown): v is ChatMessage[] {
  return (
    Array.isArray(v) &&
    v.length > 0 &&
    v.every(
      (m): m is ChatMessage =>
        !!m &&
        typeof m === 'object' &&
        CHAT_ROLES.includes((m as ChatMessage).role) &&
        typeof (m as ChatMessage).content === 'string',
    )
  )
}

/**
 * Plain text, or JSON for a multi-turn transcript. Text is stored as-is; a valid
 * `[{ role, content }]` array is parsed into a transcript (pretty-printed on blur).
 */
function InputEditor({
  input,
  onChange,
  onValidChange,
}: {
  input: ExampleInput
  onChange: (next: ExampleInput) => void
  onValidChange?: (valid: boolean) => void
}) {
  const [text, setText] = useState(() => (typeof input === 'string' ? input : JSON.stringify(input, null, 2)))

  const trimmed = text.trim()
  const looksJson = trimmed.startsWith('[')
  let parsed: ChatMessage[] | null = null
  let error: string | null = null
  if (looksJson) {
    try {
      const v = JSON.parse(trimmed)
      if (isMessageArray(v)) parsed = v
      else error = 'Expected an array of { role, content } messages'
    } catch {
      error = 'Invalid JSON'
    }
  }

  useEffect(() => onValidChange?.(!error), [error, onValidChange])

  const commit = (next: string) => {
    setText(next)
    const t = next.trim()
    if (t.startsWith('[')) {
      try {
        const v = JSON.parse(t)
        if (isMessageArray(v)) {
          onChange(v)
          return
        }
      } catch {
        // fall through: keep raw text so the user doesn't lose what they typed
      }
    }
    onChange(next)
  }

  return (
    <div className="flex flex-col gap-1.5">
      <Textarea
        value={text}
        onChange={(e) => commit(e.target.value)}
        onBlur={() => parsed && setText(JSON.stringify(parsed, null, 2))}
        rows={looksJson ? 8 : 3}
        className="font-mono text-xs"
        placeholder={'Plain text, or JSON multi-turn:\n[{ "role": "user", "content": "…" }]'}
      />
      {looksJson &&
        (error ? (
          <p className="text-[11px] text-destructive">⚠ {error}</p>
        ) : (
          <p className="text-[11px] text-muted-foreground">
            ✓ valid · {parsed?.length} {parsed?.length === 1 ? 'turn' : 'turns'}
          </p>
        ))}
    </div>
  )
}

/** Compact key/value editor for example metadata. */
function MetadataEditor({
  pairs,
  onChange,
}: {
  pairs: Array<[string, string]>
  onChange: (next: Array<[string, string]>) => void
}) {
  const setPair = (i: number, key: string, value: string) =>
    onChange(pairs.map((p, idx) => (idx === i ? [key, value] : p)))
  return (
    <div className="flex flex-col gap-1.5">
      {pairs.map(([k, v], i) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: metadata rows are positional
        <div key={i} className="flex items-center gap-1.5">
          <Input
            value={k}
            onChange={(e) => setPair(i, e.target.value, v)}
            placeholder="key"
            className="h-8 font-mono text-xs"
          />
          <Input
            value={v}
            onChange={(e) => setPair(i, k, e.target.value)}
            placeholder="value"
            className="h-8 font-mono text-xs"
          />
          <button
            type="button"
            className="text-muted-foreground hover:text-destructive"
            onClick={() => onChange(pairs.filter((_, idx) => idx !== i))}
          >
            <HugeiconsIcon icon={Delete02Icon} className="size-4" strokeWidth={2} />
          </button>
        </div>
      ))}
      <Button variant="outline" size="sm" className="self-start" onClick={() => onChange([...pairs, ['', '']])}>
        <HugeiconsIcon icon={Add01Icon} strokeWidth={2} data-icon="inline-start" />
        Field
      </Button>
    </div>
  )
}

/** Read-only transcript (result drawer). */
function TranscriptView({ turns }: { turns: ChatMessage[] }) {
  return (
    <div className="flex flex-col gap-1.5">
      {turns.map((m, i) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: static transcript view
        <div key={i} className="text-sm">
          <span className={cn('mr-1.5 font-mono text-[10px] uppercase tracking-wider', ROLE_STYLE[m.role])}>
            {m.role}
          </span>
          {m.content}
        </div>
      ))}
    </div>
  )
}

const OVERRIDE_MODELS = ['gpt-4o', 'gpt-4o-mini', 'claude-sonnet-4-6']

function countOverrides(o: AgentOverrides): number {
  return [
    o.model,
    o.temperature,
    o.top_p,
    o.max_tokens,
    o.system_prompt?.trim(),
    o.tools?.some((t) => t.name.trim()),
  ].filter((v) => v != null && v !== '' && v !== false).length
}

// Per-run overrides sent to the agent. Sampling/model/system map to native Responses
// params; tools are AG-UI client-tool declarations the agent may call (not executed here).
function AgentOverridesDrawer({
  open,
  onClose,
  overrides,
  onChange,
}: {
  open: boolean
  onClose: () => void
  overrides: AgentOverrides
  onChange: (o: AgentOverrides) => void
}) {
  const set = (patch: Partial<AgentOverrides>) => onChange({ ...overrides, ...patch })
  const tools = overrides.tools ?? []
  const setTool = (i: number, patch: Partial<ToolDecl>) =>
    set({ tools: tools.map((t, idx) => (idx === i ? { ...t, ...patch } : t)) })
  const onNum = (key: 'temperature' | 'top_p' | 'max_tokens') => (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value.trim()
    const num = Number(raw)
    set({ [key]: raw === '' || !Number.isFinite(num) ? null : num } as Partial<AgentOverrides>)
  }
  const numField = (v: number | null | undefined) => (v == null ? '' : String(v))

  return (
    <Sheet open={open} onOpenChange={(o) => !o && onClose()}>
      <SheetContent className="flex w-full flex-col gap-0 sm:max-w-md">
        <SheetHeader>
          <SheetTitle>Agent overrides</SheetTitle>
          <SheetDescription>
            Applied to every example on the next run. Empty fields use the agent's defaults.
          </SheetDescription>
        </SheetHeader>
        <div className="flex flex-1 flex-col gap-5 overflow-auto px-4 py-3">
          <Field label="Model">
            <Select
              value={overrides.model ?? 'default'}
              onValueChange={(v) => set({ model: v === 'default' ? null : v })}
            >
              <SelectTrigger className="h-8">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="default">Agent default</SelectItem>
                {OVERRIDE_MODELS.map((m) => (
                  <SelectItem key={m} value={m} className="font-mono text-xs">
                    {m}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>

          <Field label="System prompt">
            <Textarea
              rows={3}
              value={overrides.system_prompt ?? ''}
              onChange={(e) => set({ system_prompt: e.target.value || null })}
              placeholder="Override the agent's system prompt…"
            />
          </Field>

          <Field label="Tools">
            <p className="text-[11px] text-muted-foreground">
              Client tool declarations sent to the agent (AG-UI shape). The agent may call them; results aren't executed
              here.
            </p>
            {tools.map((t, i) => (
              // biome-ignore lint/suspicious/noArrayIndexKey: positional tool rows
              <div key={i} className="flex items-center gap-1.5">
                <Input
                  value={t.name}
                  onChange={(e) => setTool(i, { name: e.target.value })}
                  placeholder="tool_name"
                  className="h-8 font-mono text-xs"
                />
                <Input
                  value={t.description ?? ''}
                  onChange={(e) => setTool(i, { description: e.target.value })}
                  placeholder="what it does"
                  className="h-8 text-xs"
                />
                <button
                  type="button"
                  className="text-muted-foreground hover:text-destructive"
                  onClick={() => set({ tools: tools.filter((_, idx) => idx !== i) })}
                >
                  <HugeiconsIcon icon={Delete02Icon} className="size-4" strokeWidth={2} />
                </button>
              </div>
            ))}
            <Button
              variant="outline"
              size="sm"
              className="self-start"
              onClick={() => set({ tools: [...tools, { name: '' }] })}
            >
              <HugeiconsIcon icon={Add01Icon} strokeWidth={2} data-icon="inline-start" />
              Tool
            </Button>
          </Field>

          <Field label="Sampling">
            <div className="flex flex-col gap-3">
              {(['temperature', 'top_p', 'max_tokens'] as const).map((key) => (
                <div key={key} className="flex items-center justify-between gap-3">
                  <span className="font-mono text-xs text-muted-foreground">{key}</span>
                  <Input
                    value={numField(overrides[key])}
                    onChange={onNum(key)}
                    placeholder="default"
                    inputMode={key === 'max_tokens' ? 'numeric' : 'decimal'}
                    className="h-8 w-28 font-mono text-xs"
                  />
                </div>
              ))}
            </div>
          </Field>
        </div>
        <SheetFooter>
          <Button variant="outline" onClick={() => onChange({})}>
            Reset
          </Button>
          <SheetClose asChild>
            <Button>Done</Button>
          </SheetClose>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{label}</span>
      {children}
    </div>
  )
}

// Client-side CSV export of the dataset's examples (input · expected · metadata · source).
function downloadCsv(name: string, examples: DatasetExample[]) {
  const cell = (v: string) => `"${v.replace(/"/g, '""')}"`
  const rows = [['input', 'expected', 'metadata', 'sourceTraceId']]
  for (const e of examples) {
    const input = typeof e.input === 'string' ? e.input : JSON.stringify(e.input)
    rows.push([input, e.expected ?? '', JSON.stringify(e.metadata), e.sourceTraceId ?? ''])
  }
  const csv = rows.map((r) => r.map(cell).join(',')).join('\n')
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `${name.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}.csv`
  a.click()
  URL.revokeObjectURL(url)
}
