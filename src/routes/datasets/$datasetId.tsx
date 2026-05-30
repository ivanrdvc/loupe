import {
  Add01Icon,
  Alert02Icon,
  AlertCircleIcon,
  CheckmarkCircle02Icon,
  Download01Icon,
  Link01Icon,
  PlayCircleIcon,
} from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { createFileRoute, Link } from '@tanstack/react-router'
import type { ColumnDef } from '@tanstack/react-table'
import { useMemo, useState } from 'react'
import { toast } from 'sonner'
import { Page } from '#/components/page'
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '#/components/ui/breadcrumb'
import { Badge } from '#/components/ui/badge'
import { Button } from '#/components/ui/button'
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '#/components/ui/empty'
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from '#/components/ui/tabs'
import { Textarea } from '#/components/ui/textarea'
import { Tooltip, TooltipContent, TooltipTrigger } from '#/components/ui/tooltip'
import { cn } from '#/lib/utils'
import { DataGrid } from './-components/data-grid'
import {
  type ChatMessage,
  type DatasetDetail,
  type DatasetExample,
  type DatasetRun,
  type DatasetRunItem,
  GLOBAL_DEFAULT_ENDPOINT,
  getDatasetDetail,
  inputPreview,
  inputTurns,
  type RunItemStatus,
} from './-data'

export const Route = createFileRoute('/datasets/$datasetId')({
  component: DatasetDetailPage,
})

function DatasetDetailPage() {
  const { datasetId } = Route.useParams()
  const detail = getDatasetDetail(datasetId)

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
  return (
    <Breadcrumb>
      <BreadcrumbList>
        <BreadcrumbItem>
          <BreadcrumbLink asChild>
            <Link to="/datasets">Datasets</Link>
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

function DatasetDetailLoaded({ detail }: { detail: DatasetDetail }) {
  const { dataset, examples, runs, items } = detail
  const [tab, setTab] = useState('examples')
  const [activeExample, setActiveExample] = useState<DatasetExample | null>(null)
  const [activeItem, setActiveItem] = useState<DatasetRunItem | null>(null)
  const [endpoint, setEndpoint] = useState(dataset.endpointOverride ?? GLOBAL_DEFAULT_ENDPOINT)

  const latestRun = runs[0] ?? null
  const itemFor = (runId: string, exampleId: string) =>
    items.find((it) => it.runId === runId && it.exampleId === exampleId) ?? null

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
            <div className="flex items-center gap-1.5">
              <span className="text-xs text-muted-foreground">Version</span>
              <Select defaultValue={dataset.version}>
                <SelectTrigger size="sm" className="h-8 font-mono text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={dataset.version}>{dataset.version}</SelectItem>
                  <SelectItem value="older">May 30 18:12</SelectItem>
                  <SelectItem value="oldest">May 29 11:40</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <Button variant="outline" size="sm" onClick={() => toast.info('Download CSV — UI mock')}>
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
              latestRunId={latestRun?.id ?? null}
              itemFor={itemFor}
              onOpen={setActiveExample}
            />
          </TabsContent>

          <TabsContent value="runs" className="min-h-0 flex-1">
            <RunsTab
              detail={detail}
              endpoint={endpoint}
              onEndpointChange={setEndpoint}
              itemFor={itemFor}
              onOpenItem={setActiveItem}
            />
          </TabsContent>
        </Tabs>
      </div>

      <ExampleSheet example={activeExample} onClose={() => setActiveExample(null)} />
      <ResultSheet
        item={activeItem}
        example={activeItem ? (examples.find((e) => e.id === activeItem.exampleId) ?? null) : null}
        onClose={() => setActiveItem(null)}
      />
    </Page>
  )
}

// ─── Examples tab ──────────────────────────────────────────────────────────

function ExamplesTab({
  examples,
  latestRunId,
  itemFor,
  onOpen,
}: {
  examples: DatasetExample[]
  latestRunId: string | null
  itemFor: (runId: string, exampleId: string) => DatasetRunItem | null
  onOpen: (e: DatasetExample) => void
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
            <div className="flex items-center gap-1.5">
              <StatusIcon status={last.status} />
              <span className="line-clamp-1 text-xs text-muted-foreground">{last.output}</span>
            </div>
          ) : (
            <span className="text-xs text-muted-foreground/60">—</span>
          )
        },
        meta: { headClassName: 'w-56' },
      },
    ],
    [latestRunId, itemFor],
  )

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex items-center justify-between px-4 py-3 lg:px-6">
        <p className="text-xs text-muted-foreground">
          The questions. Edit input / expected / metadata here — that's what every run is graded against.
        </p>
        <Button size="sm" variant="outline" onClick={() => toast.info('Add example — UI mock')}>
          <HugeiconsIcon icon={Add01Icon} strokeWidth={2} data-icon="inline-start" />
          Example
        </Button>
      </div>
      <DataGrid columns={columns} data={examples} getRowId={(e) => e.id} onRowClick={onOpen} />
    </div>
  )
}

// ─── Runs tab ──────────────────────────────────────────────────────────────

function RunsTab({
  detail,
  endpoint,
  onEndpointChange,
  itemFor,
  onOpenItem,
}: {
  detail: DatasetDetail
  endpoint: string
  onEndpointChange: (v: string) => void
  itemFor: (runId: string, exampleId: string) => DatasetRunItem | null
  onOpenItem: (it: DatasetRunItem) => void
}) {
  const { examples, runs } = detail
  const latestId = runs[0]?.id ?? null
  // which runs are shown — defaults to just the latest; add more to compare
  const [selectedIds, setSelectedIds] = useState<string[]>(latestId ? [latestId] : [])

  const toggle = (id: string) =>
    setSelectedIds((prev) => {
      if (prev.includes(id)) return prev.length > 1 ? prev.filter((x) => x !== id) : prev
      return [...prev, id]
    })

  const selectedRuns = runs.filter((r) => selectedIds.includes(r.id))

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
          placeholder={GLOBAL_DEFAULT_ENDPOINT}
          className="h-8 max-w-sm font-mono text-xs"
        />
        <Tooltip>
          <TooltipTrigger asChild>
            <span>
              <Button variant="outline" size="sm" disabled className="opacity-60">
                Model ▾
              </Button>
            </span>
          </TooltipTrigger>
          <TooltipContent>Agent-behavior overrides — coming later</TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger asChild>
            <span>
              <Button variant="outline" size="sm" disabled className="opacity-60">
                Judge ▾
              </Button>
            </span>
          </TooltipTrigger>
          <TooltipContent>Scoring — coming later</TooltipContent>
        </Tooltip>
        <Button
          className="ml-auto"
          size="sm"
          onClick={() => toast.info('Run on all — UI mock')}
          disabled={!endpoint.trim()}
        >
          <HugeiconsIcon icon={PlayCircleIcon} strokeWidth={2} data-icon="inline-start" />
          Run on all
        </Button>
      </div>

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
          <RunSwitcher runs={runs} latestId={latestId} selectedIds={selectedIds} onToggle={toggle} />
          <RunResultsGrid runs={selectedRuns} examples={examples} itemFor={itemFor} onOpenItem={onOpenItem} />
        </>
      )}
    </div>
  )
}

// Quiet run selector: latest is active by default; tap others to swap/compare.
function RunSwitcher({
  runs,
  latestId,
  selectedIds,
  onToggle,
}: {
  runs: DatasetRun[]
  latestId: string | null
  selectedIds: string[]
  onToggle: (id: string) => void
}) {
  return (
    <div className="flex flex-wrap items-center gap-2 px-4 pb-3 lg:px-6">
      <span className="text-xs text-muted-foreground">Runs</span>
      {runs.map((run) => {
        const active = selectedIds.includes(run.id)
        return (
          <button
            key={run.id}
            type="button"
            onClick={() => onToggle(run.id)}
            className={cn(
              'flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-xs transition-colors',
              active
                ? 'border-primary/40 bg-primary/5 text-foreground'
                : 'border-transparent bg-muted/40 text-muted-foreground hover:bg-muted',
            )}
          >
            <span className="font-mono">{run.label}</span>
            {run.id === latestId && (
              <Badge variant="secondary" className="h-4 px-1 text-[9px]">
                latest
              </Badge>
            )}
            {run.passRate != null && (
              <span className="text-[10px] text-muted-foreground">{Math.round(run.passRate * 100)}%</span>
            )}
          </button>
        )
      })}
      <span className="text-[11px] text-muted-foreground">
        {selectedIds.length > 1 ? `comparing ${selectedIds.length}` : 'tap another run to compare'}
      </span>
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
            <span className="text-[10px] text-muted-foreground">
              {run.createdAt}
              {run.passRate != null && ` · ${Math.round(run.passRate * 100)}% (mock)`}
            </span>
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
        {runs.length > 1 && '⚠ = answer changed vs previous run · '}click any cell for the full answer + trace · score
        badges are mocked.
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
      <span className="line-clamp-3 text-xs">{it.output}</span>
      <span className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
        <StatusIcon status={it.status} />
        {it.status === 'changed' && <span className="text-warning">changed</span>}
        <span>· {(it.latencyMs / 1000).toFixed(1)}s</span>
        {it.traceId && <HugeiconsIcon icon={Link01Icon} className="size-3" strokeWidth={2} />}
      </span>
    </button>
  )
}

// ─── shared bits ─────────────────────────────────────────────────────────

function StatusIcon({ status }: { status: RunItemStatus }) {
  if (status === 'ok')
    return <HugeiconsIcon icon={CheckmarkCircle02Icon} className="size-3.5 text-success" strokeWidth={2} />
  if (status === 'changed')
    return <HugeiconsIcon icon={Alert02Icon} className="size-3.5 text-warning" strokeWidth={2} />
  if (status === 'error')
    return <HugeiconsIcon icon={AlertCircleIcon} className="size-3.5 text-destructive" strokeWidth={2} />
  return <span className="inline-block size-2 rounded-full bg-muted-foreground/40" />
}

function ExampleSheet({ example, onClose }: { example: DatasetExample | null; onClose: () => void }) {
  return (
    <Sheet open={!!example} onOpenChange={(o) => !o && onClose()}>
      <SheetContent className="flex w-full flex-col gap-0 sm:max-w-md">
        <SheetHeader>
          <SheetTitle>Example</SheetTitle>
          <SheetDescription>
            Edit the question and its expected answer. Filling Expected makes it golden.
          </SheetDescription>
        </SheetHeader>
        {example && (
          <div className="flex flex-1 flex-col gap-4 overflow-auto px-4 py-2">
            <Field label="Input">
              <InputEditor input={example.input} />
            </Field>
            <Field label="Expected">
              <Textarea
                defaultValue={example.expected ?? ''}
                rows={2}
                placeholder="Reference answer, a tool-call assertion, or a judge rubric…"
              />
              <p className="text-[11px] text-muted-foreground">
                For variable / tool-using answers this is a criterion, checked by the (later) judge — not an exact
                string match.
              </p>
            </Field>
            <Field label="Metadata">
              <div className="flex flex-wrap gap-1">
                {Object.entries(example.metadata).map(([k, v]) => (
                  <Badge key={k} variant="secondary" className="font-mono text-[10px]">
                    {k}:{v}
                  </Badge>
                ))}
              </div>
            </Field>
            {example.sourceTraceId && (
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
        )}
        <SheetFooter>
          <Button onClick={() => toast.info('Save — UI mock')}>Save</Button>
          <SheetClose asChild>
            <Button variant="outline">Cancel</Button>
          </SheetClose>
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
              <p className="rounded-md border bg-card/40 p-2">{item.output}</p>
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
              <Badge variant="outline">mocked — judging comes later</Badge>
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

/** Editable multi-turn input (mock) or a single textarea for string inputs. */
function InputEditor({ input }: { input: DatasetExample['input'] }) {
  const turns = inputTurns(input)
  if (!turns) return <Textarea defaultValue={input as string} rows={3} />
  return (
    <div className="flex flex-col gap-2">
      {turns.map((m, i) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: static mock transcript
        <div key={i} className="rounded-md border bg-card/40 p-2">
          <div className="mb-1 flex items-center justify-between">
            <span className={cn('font-mono text-[10px] uppercase tracking-wider', ROLE_STYLE[m.role])}>{m.role}</span>
          </div>
          <Textarea
            defaultValue={m.content}
            rows={1}
            className="min-h-0 resize-none border-0 bg-transparent p-0 text-sm shadow-none focus-visible:ring-0"
          />
        </div>
      ))}
      <div className="flex gap-1.5">
        <Button variant="outline" size="sm" onClick={() => toast.info('Add turn — UI mock')}>
          <HugeiconsIcon icon={Add01Icon} strokeWidth={2} data-icon="inline-start" />
          user
        </Button>
        <Button variant="outline" size="sm" onClick={() => toast.info('Add turn — UI mock')}>
          <HugeiconsIcon icon={Add01Icon} strokeWidth={2} data-icon="inline-start" />
          assistant
        </Button>
      </div>
    </div>
  )
}

/** Read-only transcript (result drawer). */
function TranscriptView({ turns }: { turns: ChatMessage[] }) {
  return (
    <div className="flex flex-col gap-1.5">
      {turns.map((m, i) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: static mock transcript
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

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{label}</span>
      {children}
    </div>
  )
}
