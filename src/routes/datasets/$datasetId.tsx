import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { createFileRoute } from '@tanstack/react-router'
import type { ColumnDef } from '@tanstack/react-table'
import { CirclePlay, Download, Link as LinkIcon, MessageCircleQuestion, Plus, SlidersHorizontal } from 'lucide-react'
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
import { Skeleton } from '#/components/ui/skeleton'
import { Switch } from '#/components/ui/switch'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '#/components/ui/tabs'
import { Tooltip, TooltipContent, TooltipTrigger } from '#/components/ui/tooltip'
import {
  type AgentOverrides,
  type DatasetDetail,
  type DatasetExample,
  type DatasetRun,
  type DatasetRunItem,
  definitionsQuery,
  GLOBAL_DEFAULT_ENDPOINT,
  inputPreview,
  inputTurns,
  judgeDefaultsQuery,
} from '#/features/evaluation'
import { judgeDatasetRun } from '#/features/evaluation/server/dataset-judge'
import { runDataset, updateDataset } from '#/features/evaluation/server/datasets'
import type { EvalDefinition } from '#/lib/eval/evaluation'
import { errMessage } from '#/lib/format'
import { queryKeys } from '#/lib/query-keys'
import { cn } from '#/lib/utils'
import { AgentOverridesDialog, countOverrides } from './-components/agent-overrides-dialog'
import { DataGrid } from './-components/data-grid'
import { ExampleDialog } from './-components/example-dialog'
import { ResultSheet } from './-components/result-sheet'
import { ScoreChip, ScoreChips, StatusIcon } from './-components/run-bits'
import { datasetDetailQuery, datasetRunDefaultsQuery } from './-data'

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
  const { data: judgeDefaults } = useQuery(judgeDefaultsQuery)
  const { data: evaluators = [] } = useQuery(definitionsQuery)
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
              <Download data-icon="inline-start" />
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
        <ExampleDialog
          key={activeExample?.id ?? 'new'}
          datasetId={dataset.id}
          example={activeExample}
          onClose={closeSheet}
          onSaved={() => {
            // Close first: holding the modal open through the invalidate
            // roundtrip swallows clicks landing on the page behind it.
            closeSheet()
            invalidate()
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
                <CirclePlay />
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
            <Plus data-icon="inline-start" />
            Example
          </Button>
        </div>
      )}
      {examples.length === 0 ? (
        <div className="px-4 lg:px-6">
          <Empty>
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <MessageCircleQuestion />
              </EmptyMedia>
              <EmptyTitle>No examples yet</EmptyTitle>
              <EmptyDescription>Add a question by hand, or capture one from a trace.</EmptyDescription>
            </EmptyHeader>
            <EmptyContent>
              <Button size="sm" onClick={onAdd}>
                <Plus data-icon="inline-start" />
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
          <SlidersHorizontal data-icon="inline-start" />
          Overrides
          {overrideCount > 0 && (
            <Badge variant="secondary" className="ml-1 font-mono text-[10px]">
              {overrideCount}
            </Badge>
          )}
        </Button>
        <Select value={judgeDefId} onValueChange={onJudgeDefChange}>
          <SelectTrigger size="sm" className="w-44 text-xs" aria-label="Judge">
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
          <CirclePlay data-icon="inline-start" />
          {running ? 'Running…' : 'Run on all'}
        </Button>
      </div>

      <AgentOverridesDialog
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
                <CirclePlay />
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
        {it.traceId && <LinkIcon className="size-3" />}
      </span>
    </button>
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
