import { useMutation, useQuery, useQueryClient, useSuspenseQuery } from '@tanstack/react-query'
import { createFileRoute, Link, useNavigate } from '@tanstack/react-router'
import {
  ChevronRight,
  CirclePlay,
  Download,
  Link as LinkIcon,
  MessageCircleQuestion,
  Plus,
  Settings2,
  SquarePen,
  Trash2,
} from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'
import { Page } from '#/components/page'
import { PageBreadcrumb } from '#/components/page-breadcrumb'
import { Spinner } from '#/components/spinner'
import { Badge } from '#/components/ui/badge'
import { Button } from '#/components/ui/button'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '#/components/ui/collapsible'
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '#/components/ui/empty'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '#/components/ui/table'
import { Tooltip, TooltipContent, TooltipTrigger } from '#/components/ui/tooltip'
import {
  type AgentOverrides,
  type ChatMessage,
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
import { errMessage, formatAgo } from '#/lib/format'
import { queryKeys } from '#/lib/query-keys'
import { cn } from '#/lib/utils'
import { ExampleDialog } from './-components/example-dialog'
import { type IdentitySelection, loadIdentitySelection, saveIdentitySelection } from './-components/identity-switcher'
import { NewRunSheet } from './-components/new-run-sheet'
import { Field, ScoreChips, StatusIcon, VerdictBadge } from './-components/run-bits'
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
  const { data: detail } = useSuspenseQuery(datasetDetailQuery(datasetId))

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

interface ItemEntry {
  item: DatasetRunItem
  at: number
}

function DatasetDetailLoaded({ detail }: { detail: DatasetDetail }) {
  const { dataset, examples, runs, items } = detail
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const { data: runDefaults } = useSuspenseQuery(datasetRunDefaultsQuery())

  const [activeExample, setActiveExample] = useState<DatasetExample | null>(null)
  const [creating, setCreating] = useState(false)
  const [expanded, setExpanded] = useState<string | null>(null)
  const [runningId, setRunningId] = useState<string | null>(null)

  const [endpoint, setEndpoint] = useState(dataset.endpointOverride ?? runDefaults.endpointUrl ?? '')
  const [overrides, setOverrides] = useState<AgentOverrides>({})
  const [selection, setSelection] = useState<IdentitySelection>({ kind: 'none' })
  const [targetId, setTargetId] = useState<string | null>(null)
  const [judgeDefId, setJudgeDefId] = useState('default')
  const [autoJudge, setAutoJudge] = useState(false)
  useEffect(() => {
    setSelection(loadIdentitySelection())
    setTargetId(loadTargetSelection())
    setAutoJudge(window.localStorage.getItem('datasets:autoJudge') === '1')
  }, [])
  const changeSelection = (s: IdentitySelection) => {
    setSelection(s)
    saveIdentitySelection(s)
  }
  const changeTarget = (id: string | null) => {
    setTargetId(id)
    saveTargetSelection(id)
  }
  const changeAutoJudge = (v: boolean) => {
    setAutoJudge(v)
    window.localStorage.setItem('datasets:autoJudge', v ? '1' : '0')
  }

  const { data: judgeDefaults } = useQuery(judgeDefaultsQuery)
  const { data: evaluators = [] } = useQuery(definitionsQuery)

  const targetingArgs = () => ({
    targetId: targetId ?? undefined,
    endpointUrl: targetId ? undefined : endpoint.trim() || undefined,
    identityId: selection.kind === 'identity' ? selection.id : undefined,
    adHocToken: selection.kind === 'adhoc' ? selection.token : undefined,
  })

  // Every answer per example, newest run first (head = the current answer shown in the row).
  const historyFor = useMemo(() => {
    const createdAt = new Map(runs.map((r) => [r.id, r.createdAt]))
    const byEx = new Map<string, ItemEntry[]>()
    for (const it of items) {
      const list = byEx.get(it.exampleId) ?? []
      list.push({ item: it, at: createdAt.get(it.runId) ?? 0 })
      byEx.set(it.exampleId, list)
    }
    for (const list of byEx.values()) list.sort((a, b) => b.at - a.at || Number(b.item.runId) - Number(a.item.runId))
    return (exampleId: string) => byEx.get(exampleId) ?? []
  }, [runs, items])

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
    onSuccess: invalidate,
    onError: (err) => toast.error(errMessage(err)),
  })

  const afterRun = async (runId: string, message: string, toastId?: string | number) => {
    await invalidate()
    toast.success(message, toastId != null ? { id: toastId } : undefined)
    if (autoJudge && judgeDefaults?.configured) judgeMutation.mutate(runId)
  }

  const runAll = useMutation({
    mutationFn: () => runDataset({ data: { datasetId: dataset.id, overrides, ...targetingArgs() } }),
    onMutate: () => ({ toastId: toast.loading('Running every question…') }),
    onSuccess: ({ runId }, _v, ctx) => afterRun(runId, 'Run complete', ctx?.toastId),
    onError: (err, _v, ctx) => toast.error(errMessage(err), { id: ctx?.toastId }),
  })

  const runOne = useMutation({
    mutationFn: (exampleId: string) =>
      runDataset({ data: { datasetId: dataset.id, exampleIds: [exampleId], overrides, ...targetingArgs() } }),
    onMutate: (exampleId) => setRunningId(exampleId),
    onSuccess: ({ runId }) => afterRun(runId, 'Answer updated'),
    onError: (err) => toast.error(errMessage(err)),
    onSettled: () => setRunningId(null),
  })

  const testMutation = useMutation({
    mutationFn: () => testAgentConnection({ data: { datasetId: dataset.id, ...targetingArgs() } }),
    onMutate: () => ({ toastId: toast.loading('Testing connection…') }),
    onSuccess: (res, _v, ctx) =>
      res.ok
        ? toast.success(`${res.message}${res.durationMs != null ? ` · ${res.durationMs}ms` : ''}`, { id: ctx?.toastId })
        : toast.error(res.message, { id: ctx?.toastId }),
    onError: (err, _v, ctx) => toast.error(errMessage(err), { id: ctx?.toastId }),
  })

  const deleteMutation = useMutation({
    mutationFn: (exampleId: string) => deleteExamples({ data: { datasetId: dataset.id, exampleIds: [exampleId] } }),
    onSuccess: async () => {
      await invalidate()
      toast.success('Example deleted')
    },
    onError: (err) => toast.error(errMessage(err)),
  })

  const persistEndpoint = useMutation({
    mutationFn: (url: string) =>
      updateDataset({ data: { datasetId: dataset.id, endpointOverride: url.trim() || null } }),
    onSuccess: invalidate,
  })
  const commitEndpoint = () => {
    if ((dataset.endpointOverride ?? '') !== endpoint.trim()) persistEndpoint.mutate(endpoint)
  }

  const openTrace = (traceId: string) =>
    void navigate({ to: '.', search: (prev) => ({ ...(prev as object), trace: traceId }) as never })

  const closeDialog = () => {
    setActiveExample(null)
    setCreating(false)
  }

  const settingsProps = {
    endpoint,
    onEndpointChange: setEndpoint,
    onEndpointCommit: commitEndpoint,
    targetId,
    onTargetChange: changeTarget,
    selection,
    onSelectionChange: changeSelection,
    onTest: () => testMutation.mutate(),
    testing: testMutation.isPending,
    overrides,
    onOverridesChange: setOverrides,
    evaluators,
    judgeDefId,
    onJudgeDefChange: setJudgeDefId,
    autoJudge,
    onAutoJudgeChange: changeAutoJudge,
    judgeConfigured: !!judgeDefaults?.configured,
    onRun: () => runAll.mutate(),
    running: runAll.isPending,
    disabled: examples.length === 0,
  }

  return (
    <Page title={<DatasetBreadcrumb name={dataset.name} />}>
      <div className="flex min-h-0 flex-1 flex-col">
        <div className="flex flex-wrap items-center gap-3 border-b px-4 py-3 lg:px-6">
          <span className="text-sm font-medium">{dataset.name}</span>
          {dataset.tags.map((t) => (
            <Badge key={t} variant="outline">
              {t}
            </Badge>
          ))}
          <DatasetStats exampleCount={examples.length} runs={runs} lastRunAt={dataset.lastRunAt} />
          <div className="ml-auto flex items-center gap-2">
            <Button variant="ghost" size="sm" onClick={() => downloadDatasetCsv(dataset.name, examples)}>
              <Download data-icon="inline-start" />
              CSV
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setActiveExample(null)
                setCreating(true)
              }}
            >
              <Plus data-icon="inline-start" />
              Example
            </Button>
            <NewRunSheet
              {...settingsProps}
              trigger={
                <Button variant="outline" size="sm">
                  <Settings2 data-icon="inline-start" />
                  Run settings
                </Button>
              }
            />
            <Button size="sm" disabled={examples.length === 0 || runAll.isPending} onClick={() => runAll.mutate()}>
              {runAll.isPending ? <Spinner data-icon="inline-start" /> : <CirclePlay data-icon="inline-start" />}
              Run all
            </Button>
          </div>
        </div>

        {examples.length === 0 ? (
          <div className="px-4 lg:px-6">
            <Empty>
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <MessageCircleQuestion />
                </EmptyMedia>
                <EmptyTitle>No questions yet</EmptyTitle>
                <EmptyDescription>Add a question by hand, or capture one from a trace.</EmptyDescription>
              </EmptyHeader>
              <EmptyContent>
                <Button
                  size="sm"
                  onClick={() => {
                    setActiveExample(null)
                    setCreating(true)
                  }}
                >
                  <Plus data-icon="inline-start" />
                  Add question
                </Button>
              </EmptyContent>
            </Empty>
          </div>
        ) : (
          <div className="min-h-0 flex-1 overflow-auto">
            <Table>
              <TableHeader className="sticky top-0 z-10 bg-muted/40 [&_th]:font-normal [&_th]:text-muted-foreground">
                <TableRow className="[&>:first-child]:pl-4 [&>:last-child]:pr-4 lg:[&>:first-child]:pl-6 lg:[&>:last-child]:pr-6">
                  <TableHead className="w-8" />
                  <TableHead>Question</TableHead>
                  <TableHead>Answer</TableHead>
                  <TableHead className="w-48">Expected</TableHead>
                  <TableHead className="w-40">Score</TableHead>
                  <TableHead className="w-12" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {examples.map((ex) => {
                  const history = historyFor(ex.id)
                  return (
                    <ExampleRow
                      key={ex.id}
                      example={ex}
                      item={history[0]?.item ?? null}
                      history={history}
                      running={runningId === ex.id}
                      expanded={expanded === ex.id}
                      onToggle={() => setExpanded((e) => (e === ex.id ? null : ex.id))}
                      onRun={() => runOne.mutate(ex.id)}
                      onEdit={() => {
                        setCreating(false)
                        setActiveExample(ex)
                      }}
                      onDelete={() => deleteMutation.mutate(ex.id)}
                      onOpenTrace={openTrace}
                    />
                  )
                })}
              </TableBody>
            </Table>
          </div>
        )}
      </div>

      {(activeExample || creating) && (
        <ExampleDialog
          key={activeExample?.id ?? 'new'}
          datasetId={dataset.id}
          example={activeExample}
          onClose={closeDialog}
          onSaved={() => {
            closeDialog()
            invalidate()
          }}
        />
      )}
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
        {exampleCount} {exampleCount === 1 ? 'question' : 'questions'}
      </span>
      {lastRun && (
        <span>
          · last run{pass != null ? ` ${Math.round(pass * 100)}% pass` : ''}
          {lastRunAt ? ` · ${formatAgo(lastRunAt)}` : ''}
        </span>
      )}
    </div>
  )
}

function ExampleRow({
  example,
  item,
  history,
  running,
  expanded,
  onToggle,
  onRun,
  onEdit,
  onDelete,
  onOpenTrace,
}: {
  example: DatasetExample
  item: DatasetRunItem | null
  history: ItemEntry[]
  running: boolean
  expanded: boolean
  onToggle: () => void
  onRun: () => void
  onEdit: () => void
  onDelete: () => void
  onOpenTrace: (traceId: string) => void
}) {
  const pad = '[&>:first-child]:pl-4 [&>:last-child]:pr-4 lg:[&>:first-child]:pl-6 lg:[&>:last-child]:pr-6'
  return (
    <>
      <TableRow className={cn('cursor-pointer', pad)} onClick={onToggle}>
        <TableCell>
          <ChevronRight className={cn('size-4 text-muted-foreground transition-transform', expanded && 'rotate-90')} />
        </TableCell>
        <TableCell className="max-w-xs">
          <QuestionCell example={example} />
        </TableCell>
        <TableCell className="max-w-sm">
          <AnswerCell item={item} running={running} />
        </TableCell>
        <TableCell className="max-w-48">
          {example.expected ? (
            <span className="line-clamp-2 text-muted-foreground">{example.expected}</span>
          ) : (
            <span className="text-xs italic text-muted-foreground/60">—</span>
          )}
        </TableCell>
        <TableCell>{item && item.status !== 'error' ? <ScoreChips it={item} /> : <Dash />}</TableCell>
        <TableCell onClick={(e) => e.stopPropagation()}>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                aria-label="Run this question"
                className="size-7 text-muted-foreground hover:text-foreground"
                disabled={running}
                onClick={onRun}
              >
                {running ? <Spinner className="size-4" /> : <CirclePlay />}
              </Button>
            </TooltipTrigger>
            <TooltipContent>Run this question</TooltipContent>
          </Tooltip>
        </TableCell>
      </TableRow>
      {expanded && (
        <TableRow className="bg-muted/20 hover:bg-muted/20">
          <TableCell colSpan={6} className="px-4 lg:px-6">
            <ExampleDetail
              item={item}
              example={example}
              history={history}
              onEdit={onEdit}
              onDelete={onDelete}
              onOpenTrace={onOpenTrace}
            />
          </TableCell>
        </TableRow>
      )}
    </>
  )
}

function ExampleDetail({
  item,
  example,
  history,
  onEdit,
  onDelete,
  onOpenTrace,
}: {
  item: DatasetRunItem | null
  example: DatasetExample
  history: ItemEntry[]
  onEdit: () => void
  onDelete: () => void
  onOpenTrace: (traceId: string) => void
}) {
  const turns = inputTurns(example.input)
  const metadata = Object.entries(example.metadata)
  const previous = history.slice(1)
  return (
    <div className="flex flex-col gap-4 py-3 text-sm">
      <Field label="Question">{turns ? <Transcript turns={turns} /> : <p>{inputPreview(example.input)}</p>}</Field>
      <Field label="Expected">
        <p className="text-muted-foreground">{example.expected ?? '—'}</p>
      </Field>
      {item ? (
        item.status === 'error' ? (
          <Field label="Error">
            <pre className="whitespace-pre-wrap break-words rounded-md border border-destructive/40 bg-destructive/10 p-2 font-mono text-xs text-destructive">
              {item.errorText?.trim() || 'Run failed (no error detail captured).'}
            </pre>
          </Field>
        ) : (
          <>
            <Field label="Answer">
              <p className="rounded-md border bg-card/40 p-2">{item.output}</p>
            </Field>
            <Field label="Score">
              <ScoreChips it={item} />
            </Field>
          </>
        )
      ) : (
        <p className="text-xs text-muted-foreground/60">Not run yet — hit the run button to call your agent.</p>
      )}
      {metadata.length > 0 && (
        <Field label="Metadata">
          <div className="flex flex-wrap gap-1">
            {metadata.map(([k, v]) => (
              <Badge key={k} variant="secondary" className="font-mono text-[10px]">
                {k}:{v}
              </Badge>
            ))}
          </div>
        </Field>
      )}
      {previous.length > 0 && (
        <Collapsible>
          <CollapsibleTrigger className="group flex items-center gap-2 rounded-md py-1 text-left text-xs text-muted-foreground hover:text-foreground">
            <ChevronRight className="size-3.5 transition-transform group-data-[state=open]:rotate-90" />
            <span className="font-semibold uppercase tracking-wider">Previous answers</span>
            <span className="text-muted-foreground/60">{previous.length}</span>
          </CollapsibleTrigger>
          <CollapsibleContent className="pt-2">
            <ul className="flex flex-col divide-y rounded-md border">
              {previous.map(({ item: it, at }) => (
                <li key={it.runId} className="flex items-start gap-2 px-2.5 py-2 text-xs">
                  <span className="w-14 shrink-0 text-muted-foreground">{formatAgo(at)}</span>
                  <StatusIcon status={it.status} />
                  <span className="min-w-0 flex-1 line-clamp-2">
                    {it.status === 'error' ? <span className="text-destructive">run failed</span> : it.output}
                  </span>
                  <VerdictBadge it={it} />
                  {it.traceId && (
                    <button
                      type="button"
                      className="shrink-0 text-muted-foreground hover:text-foreground"
                      onClick={() => onOpenTrace(it.traceId as string)}
                    >
                      <LinkIcon className="size-3" />
                    </button>
                  )}
                </li>
              ))}
            </ul>
          </CollapsibleContent>
        </Collapsible>
      )}
      <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
        {item && (
          <span className="flex items-center gap-1.5">
            <StatusIcon status={item.status} />
            {(item.latencyMs / 1000).toFixed(1)}s · {item.tokens} tok
          </span>
        )}
        {item?.traceId && (
          <Button
            variant="link"
            size="sm"
            className="h-auto gap-1 p-0 font-mono text-xs"
            onClick={() => onOpenTrace(item.traceId as string)}
          >
            answer trace <LinkIcon className="size-3" />
          </Button>
        )}
        {example.sourceTraceId && (
          <Button asChild variant="link" size="sm" className="h-auto gap-1 p-0 font-mono text-xs">
            <Link to="/traces/$traceId" params={{ traceId: example.sourceTraceId }}>
              source trace <LinkIcon className="size-3" />
            </Link>
          </Button>
        )}
        <div className="ml-auto flex items-center gap-1">
          <Button variant="ghost" size="sm" onClick={onEdit}>
            <SquarePen data-icon="inline-start" />
            Edit
          </Button>
          <Button variant="ghost" size="sm" className="text-muted-foreground hover:text-destructive" onClick={onDelete}>
            <Trash2 data-icon="inline-start" />
            Delete
          </Button>
        </div>
      </div>
    </div>
  )
}

function QuestionCell({ example }: { example: DatasetExample }) {
  const turns = inputTurns(example.input)
  return (
    <div className="flex flex-col gap-1">
      {turns && (
        <Badge variant="secondary" className="w-fit text-[10px]">
          {turns.length} turns
        </Badge>
      )}
      <span className="line-clamp-2 text-sm">{inputPreview(example.input)}</span>
    </div>
  )
}

function AnswerCell({ item, running }: { item: DatasetRunItem | null; running: boolean }) {
  if (running)
    return (
      <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <Spinner className="size-3.5" />
        running…
      </span>
    )
  if (!item) return <span className="text-xs italic text-muted-foreground/60">not run yet</span>
  if (item.status === 'error') return <span className="text-xs text-destructive">run failed</span>
  return <span className="line-clamp-2 text-sm">{item.output}</span>
}

function Dash() {
  return <span className="text-xs text-muted-foreground/60">—</span>
}

const ROLE_STYLE: Record<ChatMessage['role'], string> = {
  system: 'text-muted-foreground',
  user: 'text-foreground',
  assistant: 'text-primary',
  tool: 'text-warning',
}

function Transcript({ turns }: { turns: ChatMessage[] }) {
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
