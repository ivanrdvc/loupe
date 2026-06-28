import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { createFileRoute, Link } from '@tanstack/react-router'
import type { ColumnDef } from '@tanstack/react-table'
import {
  CircleAlert,
  CircleCheck,
  CirclePlay,
  Download,
  Link as LinkIcon,
  MessageCircleQuestion,
  Plus,
  Trash2,
  UserRound,
} from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'
import { Page } from '#/components/page'
import { PageBreadcrumb } from '#/components/page-breadcrumb'
import { Spinner } from '#/components/spinner'
import { Badge } from '#/components/ui/badge'
import { Button } from '#/components/ui/button'
import { Checkbox } from '#/components/ui/checkbox'
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '#/components/ui/empty'
import { Skeleton } from '#/components/ui/skeleton'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '#/components/ui/tabs'
import { Tooltip, TooltipContent, TooltipTrigger } from '#/components/ui/tooltip'
import {
  type AgentOverrides,
  type DatasetDetail,
  type DatasetExample,
  type DatasetRun,
  type DatasetRunItem,
  definitionsQuery,
  inputPreview,
  inputTurns,
  judgeDefaultsQuery,
} from '#/features/evaluation'
import { judgeDatasetRun } from '#/features/evaluation/server/dataset-judge'
import { deleteExamples, runDataset, testAgentConnection, updateDataset } from '#/features/evaluation/server/datasets'
import { downloadCsv } from '#/lib/csv'
import type { EvalDefinition } from '#/lib/eval/evaluation'
import { errMessage, formatAgo } from '#/lib/format'
import { queryKeys } from '#/lib/query-keys'
import { ACCENT } from '#/lib/tone'
import { cn } from '#/lib/utils'
import { DataGrid } from './-components/data-grid'
import { ExampleDialog } from './-components/example-dialog'
import { type IdentitySelection, loadIdentitySelection, saveIdentitySelection } from './-components/identity-switcher'
import { NewRunSheet } from './-components/new-run-sheet'
import { ResultDialog } from './-components/result-dialog'
import {
  type CompareSummary,
  CompareSummaryBar,
  type Delta,
  DeltaBadge,
  NO_FILTER,
  type RunFilter,
  RunFilterChips,
  runFilterMatches,
  runItemDelta,
  ScoreChip,
  StatusBadge,
  StatusIcon,
  VerdictBadge,
} from './-components/run-bits'
import { loadTargetSelection, saveTargetSelection } from './-components/target-picker'
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
  const [selection, setSelection] = useState<IdentitySelection>({ kind: 'none' })
  const [targetId, setTargetId] = useState<string | null>(null)
  useEffect(() => {
    setSelection(loadIdentitySelection())
    setTargetId(loadTargetSelection())
  }, [])
  const changeSelection = (s: IdentitySelection) => {
    setSelection(s)
    saveIdentitySelection(s)
  }
  const changeTarget = (id: string | null) => {
    setTargetId(id)
    saveTargetSelection(id)
  }
  // A saved target supplies its own endpoint; only send the custom URL box when none is picked.
  const targetingArgs = () => ({
    targetId: targetId ?? undefined,
    endpointUrl: targetId ? undefined : endpoint.trim() || undefined,
    identityId: selection.kind === 'identity' ? selection.id : undefined,
    adHocToken: selection.kind === 'adhoc' ? selection.token : undefined,
  })
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

  const onRunSuccess = async (runId: string, message: string, toastId?: string | number) => {
    await invalidate()
    setSelectedIds([runId])
    setTab('runs')
    toast.success(message, toastId != null ? { id: toastId } : undefined)
    if (autoJudge && judgeDefaults?.configured) judgeMutation.mutate(runId)
  }

  const runMutation = useMutation({
    mutationFn: () => runDataset({ data: { datasetId: dataset.id, overrides, ...targetingArgs() } }),
    onMutate: () => ({ toastId: toast.loading('Running on every example…') }),
    onSuccess: ({ runId }, _vars, ctx) => onRunSuccess(runId, 'Run complete', ctx?.toastId),
    onError: (err, _vars, ctx) => toast.error(errMessage(err), { id: ctx?.toastId }),
  })

  const testMutation = useMutation({
    mutationFn: () => testAgentConnection({ data: { datasetId: dataset.id, ...targetingArgs() } }),
    onMutate: () => ({ toastId: toast.loading('Testing connection…') }),
    onSuccess: (res, _vars, ctx) =>
      res.ok
        ? toast.success(`${res.message}${res.durationMs != null ? ` · ${res.durationMs}ms` : ''}`, { id: ctx?.toastId })
        : toast.error(res.message, { id: ctx?.toastId }),
    onError: (err, _vars, ctx) => toast.error(errMessage(err), { id: ctx?.toastId }),
  })

  const [runningExampleId, setRunningExampleId] = useState<string | null>(null)
  const runExampleMutation = useMutation({
    mutationFn: (exampleId: string) =>
      runDataset({ data: { datasetId: dataset.id, exampleIds: [exampleId], overrides, ...targetingArgs() } }),
    onMutate: (exampleId) => setRunningExampleId(exampleId),
    onSuccess: ({ runId }) => onRunSuccess(runId, 'Example run complete'),
    onError: (err) => toast.error(errMessage(err)),
    onSettled: () => setRunningExampleId(null),
  })

  const bulkDeleteMutation = useMutation({
    mutationFn: (exampleIds: string[]) => deleteExamples({ data: { datasetId: dataset.id, exampleIds } }),
    onSuccess: async (_r, ids) => {
      await invalidate()
      toast.success(`Deleted ${ids.length} example${ids.length === 1 ? '' : 's'}`)
    },
    onError: (err) => toast.error(errMessage(err)),
  })

  const bulkRunMutation = useMutation({
    mutationFn: (exampleIds: string[]) =>
      runDataset({ data: { datasetId: dataset.id, exampleIds, overrides, ...targetingArgs() } }),
    onMutate: () => ({ toastId: toast.loading('Running selected examples…') }),
    onSuccess: ({ runId }, _ids, ctx) => onRunSuccess(runId, 'Run complete', ctx?.toastId),
    onError: (err, _ids, ctx) => toast.error(errMessage(err), { id: ctx?.toastId }),
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
          <DatasetStats exampleCount={examples.length} runs={runs} lastRunAt={dataset.lastRunAt} />
          <div className="ml-auto flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => downloadDatasetCsv(dataset.name, examples)}>
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
              onBulkDelete={(ids) => bulkDeleteMutation.mutate(ids)}
              onBulkRun={(ids) => bulkRunMutation.mutate(ids)}
            />
          </TabsContent>

          <TabsContent value="runs" className="min-h-0 flex-1">
            <RunsTab
              detail={detail}
              endpoint={endpoint}
              onEndpointChange={setEndpoint}
              onEndpointCommit={commitEndpoint}
              targetId={targetId}
              onTargetChange={changeTarget}
              selection={selection}
              onSelectionChange={changeSelection}
              onTest={() => testMutation.mutate()}
              testing={testMutation.isPending}
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
      <ResultDialog
        item={activeItem}
        example={activeItem ? (examples.find((e) => e.id === activeItem.exampleId) ?? null) : null}
        onClose={() => setActiveItem(null)}
      />
    </Page>
  )
}

function DatasetStats({
  exampleCount,
  runs,
  lastRunAt,
}: {
  exampleCount: number
  runs: DatasetRun[]
  lastRunAt: number | null
}) {
  const lastRun = runs[0] ?? null
  const pass = lastRun?.passRate
  return (
    <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
      <span>
        {exampleCount} {exampleCount === 1 ? 'example' : 'examples'}
      </span>
      {runs.length > 0 && (
        <span>
          · {runs.length} {runs.length === 1 ? 'run' : 'runs'}
        </span>
      )}
      {lastRun && (
        <span>
          · last run{pass != null ? ` ${Math.round(pass * 100)}% pass` : ''}
          {lastRunAt ? ` · ${formatAgo(lastRunAt)}` : ''}
        </span>
      )}
    </div>
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
  onBulkDelete,
  onBulkRun,
}: {
  examples: DatasetExample[]
  latestRunId: string | null
  itemFor: (runId: string, exampleId: string) => DatasetRunItem | null
  onRun: (e: DatasetExample) => void
  runningId: string | null
  onOpen: (e: DatasetExample) => void
  onAdd: () => void
  onBulkDelete: (ids: string[]) => void
  onBulkRun: (ids: string[]) => void
}) {
  const [selected, setSelected] = useState<Set<string>>(() => new Set())
  const toggle = useCallback(
    (id: string) =>
      setSelected((prev) => {
        const next = new Set(prev)
        next.has(id) ? next.delete(id) : next.add(id)
        return next
      }),
    [],
  )
  const allSelected = examples.length > 0 && selected.size === examples.length
  const clear = () => setSelected(new Set())

  const columns = useMemo<ColumnDef<DatasetExample, unknown>[]>(
    () => [
      {
        id: 'select',
        header: () => (
          <Checkbox
            checked={allSelected ? true : selected.size > 0 ? 'indeterminate' : false}
            onCheckedChange={(v) => setSelected(v ? new Set(examples.map((e) => e.id)) : new Set())}
            aria-label="Select all"
          />
        ),
        cell: ({ row }) => (
          <Checkbox
            checked={selected.has(row.original.id)}
            onCheckedChange={() => toggle(row.original.id)}
            onClick={(e) => e.stopPropagation()}
            aria-label="Select example"
          />
        ),
        meta: { headClassName: 'w-8' },
      },
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
        id: 'origin',
        header: 'Origin',
        cell: ({ row }) => {
          const traceId = row.original.sourceTraceId
          if (!traceId) return <span className="text-xs italic text-muted-foreground/60">manual</span>
          return (
            <Button
              asChild
              variant="link"
              size="sm"
              className="h-auto justify-start gap-1 p-0 font-mono text-xs"
              onClick={(e) => e.stopPropagation()}
            >
              <Link to="/traces/$traceId" params={{ traceId }}>
                {traceId.slice(0, 8)}
                <LinkIcon className="size-3" />
              </Link>
            </Button>
          )
        },
        meta: { headClassName: 'w-28' },
      },
      {
        id: 'lastRun',
        header: 'Last run',
        cell: ({ row }) => {
          if (runningId === row.original.id) {
            return (
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <Spinner className="size-3.5" />
                running…
              </div>
            )
          }
          const last = latestRunId ? itemFor(latestRunId, row.original.id) : null
          if (!last) return <span className="text-xs text-muted-foreground/60">—</span>
          const errored = last.status === 'error'
          return (
            <div className="flex min-w-0 items-center gap-1.5">
              <StatusIcon status={last.status} />
              <span className={cn('truncate text-xs', errored ? 'text-destructive' : 'text-muted-foreground')}>
                {errored ? last.errorText?.trim() || 'failed' : last.output}
              </span>
            </div>
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
                {runningId === row.original.id ? <Spinner className="size-4" /> : <CirclePlay />}
              </Button>
            </TooltipTrigger>
            <TooltipContent>Run just this example</TooltipContent>
          </Tooltip>
        ),
        meta: { headClassName: 'w-12' },
      },
    ],
    [latestRunId, itemFor, onRun, runningId, selected, allSelected, examples, toggle],
  )

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {selected.size > 0 ? (
        <div className="flex items-center gap-2 border-b bg-muted/30 px-4 py-2.5 lg:px-6">
          <span className="text-xs font-medium">{selected.size} selected</span>
          <Button size="sm" variant="outline" onClick={() => onBulkRun([...selected])}>
            <CirclePlay data-icon="inline-start" />
            Run
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="text-destructive hover:text-destructive"
            onClick={() => {
              onBulkDelete([...selected])
              clear()
            }}
          >
            <Trash2 data-icon="inline-start" />
            Delete
          </Button>
          <Button size="sm" variant="ghost" className="ml-auto" onClick={clear}>
            Clear
          </Button>
        </div>
      ) : (
        examples.length > 0 && (
          <div className="flex items-center justify-between px-4 py-3 lg:px-6">
            <p className="text-xs text-muted-foreground">
              The questions. Edit input / expected / metadata here — that's what every run is graded against.
            </p>
            <Button size="sm" variant="outline" onClick={onAdd}>
              <Plus data-icon="inline-start" />
              Example
            </Button>
          </div>
        )
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
  targetId,
  onTargetChange,
  selection,
  onSelectionChange,
  onTest,
  testing,
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
  targetId: string | null
  onTargetChange: (id: string | null) => void
  selection: IdentitySelection
  onSelectionChange: (s: IdentitySelection) => void
  onTest: () => void
  testing: boolean
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
  const [filter, setFilter] = useState<RunFilter>(NO_FILTER)

  // Keep focus-first order so compare lays the second run beside it.
  const selectedRuns = selectedIds.map((id) => runs.find((r) => r.id === id)).filter((r): r is DatasetRun => !!r)

  const runSheetProps = {
    endpoint,
    onEndpointChange,
    onEndpointCommit,
    targetId,
    onTargetChange,
    selection,
    onSelectionChange,
    onTest,
    testing,
    overrides,
    onOverridesChange,
    evaluators,
    judgeDefId,
    onJudgeDefChange,
    autoJudge,
    onAutoJudgeChange,
    judgeConfigured,
    onRun,
    running,
    disabled: examples.length === 0,
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex items-center justify-between px-4 py-3 lg:px-6">
        <p className="text-xs text-muted-foreground">
          {runs.length === 0
            ? 'Run the dataset against your agent.'
            : `${runs.length} run${runs.length === 1 ? '' : 's'}`}
        </p>
        {runs.length > 0 && (
          <div className="flex items-center gap-2">
            <Tooltip>
              <TooltipTrigger asChild>
                <span>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={!judgeRunId || !judgeConfigured || judging}
                    onClick={onJudge}
                  >
                    {judging ? 'Judging…' : 'Judge run'}
                  </Button>
                </span>
              </TooltipTrigger>
              {!judgeConfigured && (
                <TooltipContent>Set OPENAI_API_KEY or ANTHROPIC_API_KEY to enable judging</TooltipContent>
              )}
            </Tooltip>
            <NewRunSheet {...runSheetProps} />
          </div>
        )}
      </div>

      {runs.length === 0 ? (
        <div className="px-4 lg:px-6">
          <Empty>
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <CirclePlay />
              </EmptyMedia>
              <EmptyTitle>No runs yet</EmptyTitle>
              <EmptyDescription>Point the run sheet at your agent and fire every question.</EmptyDescription>
            </EmptyHeader>
            <EmptyContent>
              <NewRunSheet
                {...runSheetProps}
                trigger={
                  <Button size="sm">
                    <CirclePlay data-icon="inline-start" />
                    Run this dataset
                  </Button>
                }
              />
            </EmptyContent>
          </Empty>
        </div>
      ) : (
        <>
          <RunList runs={runs} items={detail.items} selectedIds={selectedIds} onSelectedChange={onSelectedChange} />
          {selectedRuns.length > 1 ? (
            <CompareGrid runs={selectedRuns} examples={examples} itemFor={itemFor} onOpenItem={onOpenItem} />
          ) : (
            <SingleRunList
              run={selectedRuns[0] ?? null}
              examples={examples}
              itemFor={itemFor}
              onOpenItem={onOpenItem}
              filter={filter}
              onFilterChange={setFilter}
            />
          )}
        </>
      )}
    </div>
  )
}

// One ticked → single run; two+ → compare (baseline=earliest, current=latest).
function RunList({
  runs,
  items,
  selectedIds,
  onSelectedChange,
}: {
  runs: DatasetRun[]
  items: DatasetRunItem[]
  selectedIds: string[]
  onSelectedChange: (ids: string[]) => void
}) {
  const latestId = runs[0]?.id ?? null
  const selected = new Set(selectedIds)

  const errorCounts = useMemo(() => {
    const m = new Map<string, number>()
    for (const it of items) if (it.status === 'error') m.set(it.runId, (m.get(it.runId) ?? 0) + 1)
    return m
  }, [items])

  // Never let the list empty out — unticking the last selected run is a no-op.
  const toggle = (id: string) => {
    if (selected.has(id)) {
      if (selected.size === 1) return
      onSelectedChange(selectedIds.filter((x) => x !== id))
    } else {
      onSelectedChange([...selectedIds, id])
    }
  }

  return (
    <div className="px-4 pb-3 lg:px-6">
      <p className="mb-1.5 text-[11px] text-muted-foreground">
        Tick one run to inspect it, or two or more to compare them side by side.
      </p>
      <ul className="flex flex-col divide-y rounded-lg border">
        {runs.map((run) => {
          const isSelected = selected.has(run.id)
          const errors = errorCounts.get(run.id) ?? 0
          return (
            <li key={run.id}>
              <button
                type="button"
                onClick={() => toggle(run.id)}
                className={cn(
                  'flex w-full items-center gap-3 px-3 py-2 text-left hover:bg-muted/50',
                  isSelected && 'bg-muted/40',
                )}
              >
                <Checkbox
                  checked={isSelected}
                  tabIndex={-1}
                  aria-label={`Select ${run.label}`}
                  className="pointer-events-none"
                />
                <span className="font-mono text-xs">{run.label}</span>
                {run.id === latestId && (
                  <Badge variant="secondary" className="text-[10px]">
                    latest
                  </Badge>
                )}
                <span className="text-xs text-muted-foreground">{formatAgo(run.createdAt)}</span>
                {run.identityLabel && (
                  <Badge variant="outline" className="gap-1 font-normal text-muted-foreground">
                    <UserRound className="size-3" />
                    {run.identityLabel}
                  </Badge>
                )}
                <div className="ml-auto flex items-center gap-2">
                  {errors > 0 ? (
                    <Badge variant="outline" className="gap-1 border-destructive/40 font-normal text-destructive">
                      <CircleAlert className="size-3" />
                      {errors} err
                    </Badge>
                  ) : (
                    <Badge
                      variant="outline"
                      className={cn('gap-1 border-emerald-600/40 font-normal', ACCENT.emerald.status)}
                    >
                      <CircleCheck className="size-3" />
                      ok
                    </Badge>
                  )}
                  <span className="w-12 text-right text-xs tabular-nums text-muted-foreground">
                    {run.passRate != null ? `${Math.round(run.passRate * 100)}%` : '—'}
                  </span>
                </div>
              </button>
            </li>
          )
        })}
      </ul>
    </div>
  )
}

function SingleRunList({
  run,
  examples,
  itemFor,
  onOpenItem,
  filter,
  onFilterChange,
}: {
  run: DatasetRun | null
  examples: DatasetExample[]
  itemFor: (runId: string, exampleId: string) => DatasetRunItem | null
  onOpenItem: (it: DatasetRunItem) => void
  filter: RunFilter
  onFilterChange: (f: RunFilter) => void
}) {
  const rows = examples
    .map((ex) => ({ ex, it: run ? itemFor(run.id, ex.id) : null }))
    .filter(({ it }) => runFilterMatches(filter, it))

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3 px-4 pb-4 lg:px-6">
      <RunFilterChips filter={filter} onChange={onFilterChange} />
      <div className="min-h-0 flex-1 overflow-auto">
        {rows.length === 0 ? (
          <div className="rounded-lg border px-3 py-8 text-center text-xs text-muted-foreground">
            No results match these filters.
          </div>
        ) : (
          <ul className="flex flex-col divide-y rounded-lg border">
            {rows.map(({ ex, it }) => (
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
                      <p className="text-xs text-destructive">{it.errorText?.trim() || 'run failed'}</p>
                    ) : it ? (
                      <p className="line-clamp-2 text-xs text-muted-foreground">{it.output}</p>
                    ) : (
                      <p className="text-xs text-muted-foreground/60">not in this run</p>
                    )}
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <StatusBadge it={it} />
                    <VerdictBadge it={it} />
                  </div>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}

function CompareGrid({
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
  const [onlyRegressions, setOnlyRegressions] = useState(false)
  const chrono = [...runs].sort((a, b) => a.createdAt - b.createdAt || Number(a.id) - Number(b.id))
  const baselineId = chrono[0].id
  const currentId = chrono[chrono.length - 1].id

  const deltaFor = useCallback(
    (exampleId: string): Delta => runItemDelta(itemFor(baselineId, exampleId), itemFor(currentId, exampleId)),
    [itemFor, baselineId, currentId],
  )

  const deltas = useMemo(() => new Map(examples.map((ex) => [ex.id, deltaFor(ex.id)])), [examples, deltaFor])
  const summary = useMemo<CompareSummary>(() => {
    const s = { regressed: 0, improved: 0, unchanged: 0 }
    for (const d of deltas.values()) s[d] += 1
    return s
  }, [deltas])

  const rows = onlyRegressions ? examples.filter((ex) => deltas.get(ex.id) === 'regressed') : examples

  const columns: ColumnDef<DatasetExample, unknown>[] = [
    {
      id: 'input',
      header: 'Input',
      cell: ({ row }) => (
        <div className="flex flex-col gap-1.5">
          <DeltaBadge delta={deltas.get(row.original.id) ?? 'unchanged'} />
          <InputCell example={row.original} />
        </div>
      ),
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
    ...chrono.map(
      (run): ColumnDef<DatasetExample, unknown> => ({
        id: run.id,
        header: () => (
          <div className="flex flex-col gap-0.5 py-1">
            <span className="font-mono text-xs text-foreground">
              {run.label}
              {run.id === baselineId && <span className="ml-1 text-muted-foreground">· baseline</span>}
              {run.id === currentId && <span className="ml-1 text-muted-foreground">· current</span>}
            </span>
            {run.passRate != null && (
              <span className="text-[10px] text-muted-foreground">{Math.round(run.passRate * 100)}% pass</span>
            )}
          </div>
        ),
        cell: ({ row }) => {
          const delta = run.id === currentId ? (deltas.get(row.original.id) ?? 'unchanged') : 'unchanged'
          return (
            <div className={cn('-m-2 p-2', delta === 'regressed' && 'bg-destructive/5')}>
              <OutputCell it={itemFor(run.id, row.original.id)} onOpenItem={onOpenItem} />
            </div>
          )
        },
        meta: { headClassName: 'w-80' },
      }),
    ),
  ]

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="px-4 pb-3 lg:px-6">
        <CompareSummaryBar
          summary={summary}
          onlyRegressions={onlyRegressions}
          onToggleRegressions={() => setOnlyRegressions((v) => !v)}
        />
      </div>
      {rows.length === 0 ? (
        <div className="px-4 lg:px-6">
          <div className="rounded-lg border px-3 py-8 text-center text-xs text-muted-foreground">
            No regressions between these runs.
          </div>
        </div>
      ) : (
        <DataGrid columns={columns} data={rows} getRowId={(e) => e.id} />
      )}
      <p className="px-4 py-2 text-[11px] text-muted-foreground lg:px-6">
        Delta is current vs baseline (PASS→FAIL or ok→error = regression). Click any cell for the full answer + trace.
      </p>
    </div>
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
      <div className="flex flex-wrap items-center gap-1">
        <StatusBadge it={it} />
        <VerdictBadge it={it} />
        {it.scores.map((s) => (
          <ScoreChip key={s.name} s={s} />
        ))}
      </div>
      <span className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
        {it.status === 'changed' && <span className="text-warning">changed</span>}
        <span>{(it.latencyMs / 1000).toFixed(1)}s</span>
        {it.traceId && <LinkIcon className="size-3" />}
      </span>
    </button>
  )
}

function downloadDatasetCsv(name: string, examples: DatasetExample[]) {
  const rows = examples.map((e) => [
    typeof e.input === 'string' ? e.input : JSON.stringify(e.input),
    e.expected ?? '',
    JSON.stringify(e.metadata),
    e.sourceTraceId ?? '',
  ])
  downloadCsv(
    `${name.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}.csv`,
    ['input', 'expected', 'metadata', 'sourceTraceId'],
    rows,
  )
}
