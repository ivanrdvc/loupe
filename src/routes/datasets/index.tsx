import { Add01Icon, Database01Icon, PlayCircleIcon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { IconSearch } from '@tabler/icons-react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { createFileRoute, useNavigate } from '@tanstack/react-router'
import {
  type ColumnDef,
  type ColumnFiltersState,
  getCoreRowModel,
  getFacetedRowModel,
  getFacetedUniqueValues,
  getFilteredRowModel,
  useReactTable,
} from '@tanstack/react-table'
import { formatDistanceToNow } from 'date-fns'
import { useMemo, useState } from 'react'
import { toast } from 'sonner'
import { DataTableFacetedFilter } from '#/components/data-table-faceted-filter'
import { Page } from '#/components/page'
import { Badge } from '#/components/ui/badge'
import { Button } from '#/components/ui/button'
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
import { Textarea } from '#/components/ui/textarea'
import { Tooltip, TooltipContent, TooltipTrigger } from '#/components/ui/tooltip'
import { queryKeys } from '#/lib/query-keys'
import { createDataset, runDataset } from '#/server/datasets'
import { DataGridBody } from './-components/data-grid'
import { type DatasetListItem, datasetsListQuery } from './-data'

export const Route = createFileRoute('/datasets/')({
  loader: ({ context }) => context.queryClient.ensureQueryData(datasetsListQuery()),
  component: DatasetsListPage,
})

const relTime = (ms: number) => formatDistanceToNow(new Date(ms), { addSuffix: true })

function makeColumns(
  onRun: (d: DatasetListItem) => void,
  running: string | null,
): ColumnDef<DatasetListItem, unknown>[] {
  return [
    {
      id: 'name',
      header: 'Name',
      accessorFn: (d) => d.name,
      filterFn: 'includesString',
      cell: ({ row }) => (
        <div className="flex flex-col gap-0.5">
          <span className="font-medium">{row.original.name}</span>
          {row.original.description && (
            <span className="line-clamp-1 text-xs text-muted-foreground">{row.original.description}</span>
          )}
        </div>
      ),
    },
    {
      id: 'examples',
      header: 'Examples',
      cell: ({ row }) => row.original.exampleCount,
      meta: { className: 'text-right font-mono text-sm tabular-nums', headClassName: 'w-24 text-right' },
    },
    {
      id: 'runs',
      header: 'Runs',
      cell: ({ row }) => row.original.runCount,
      meta: { className: 'text-right font-mono text-sm tabular-nums', headClassName: 'w-20 text-right' },
    },
    {
      id: 'lastRun',
      header: 'Last run',
      cell: ({ row }) => (
        <span className="text-sm text-muted-foreground">
          {row.original.lastRunAt != null ? relTime(row.original.lastRunAt) : '—'}
        </span>
      ),
      meta: { headClassName: 'w-28' },
    },
    {
      id: 'updated',
      header: 'Updated',
      cell: ({ row }) => <span className="text-sm text-muted-foreground">{relTime(row.original.updatedAt)}</span>,
      meta: { headClassName: 'w-28' },
    },
    {
      id: 'tags',
      header: 'Tags',
      accessorFn: (d) => d.tags,
      filterFn: (row, id, value: string[]) => value.some((v) => (row.getValue(id) as string[]).includes(v)),
      cell: ({ row }) => (
        <div className="flex flex-wrap gap-1">
          {row.original.tags.map((t) => (
            <Badge key={t} variant="outline">
              {t}
            </Badge>
          ))}
        </div>
      ),
      meta: { headClassName: 'w-40' },
    },
    {
      id: 'run',
      header: '',
      cell: ({ row }) => (
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="size-7 text-muted-foreground hover:text-foreground"
              disabled={running === row.original.id || row.original.exampleCount === 0}
              onClick={(e) => {
                e.stopPropagation()
                onRun(row.original)
              }}
            >
              <HugeiconsIcon icon={PlayCircleIcon} strokeWidth={2} />
            </Button>
          </TooltipTrigger>
          <TooltipContent>
            {row.original.exampleCount === 0 ? 'No examples to run' : 'Run on default agent'}
          </TooltipContent>
        </Tooltip>
      ),
      meta: { headClassName: 'w-12' },
    },
  ]
}

function DatasetsListPage() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { data = [] } = useQuery(datasetsListQuery())
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([])
  const [newOpen, setNewOpen] = useState(false)
  const [runningId, setRunningId] = useState<string | null>(null)

  const runMutation = useMutation({
    mutationFn: (d: DatasetListItem) => runDataset({ data: { datasetId: d.id } }),
    onMutate: (d) => setRunningId(d.id),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.datasets.all() })
      toast.success('Run complete')
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : String(err)),
    onSettled: () => setRunningId(null),
  })

  const tagOptions = useMemo(() => {
    const tags = new Set<string>()
    for (const d of data) for (const t of d.tags) tags.add(t)
    return [...tags].sort().map((t) => ({ label: t, value: t }))
  }, [data])

  const columns = useMemo(() => makeColumns((d) => runMutation.mutate(d), runningId), [runMutation, runningId])

  const table = useReactTable({
    data,
    columns,
    state: { columnFilters },
    getRowId: (d) => d.id,
    onColumnFiltersChange: setColumnFilters,
    getCoreRowModel: getCoreRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getFacetedRowModel: getFacetedRowModel(),
    getFacetedUniqueValues: getFacetedUniqueValues(),
  })

  const nameColumn = table.getColumn('name')
  const isFiltered = columnFilters.length > 0
  const hasRows = table.getRowModel().rows.length > 0

  return (
    <Page title="Datasets">
      <div className="flex min-h-0 flex-1 flex-col">
        <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 lg:px-6">
          <div className="flex flex-1 flex-wrap items-center gap-2">
            <div className="relative w-full min-w-0 sm:w-64">
              <IconSearch className="pointer-events-none absolute top-1/2 left-2 size-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Search datasets…"
                value={(nameColumn?.getFilterValue() as string) ?? ''}
                onChange={(e) => nameColumn?.setFilterValue(e.target.value)}
                className="h-8 w-full pl-7"
              />
            </div>
            {table.getColumn('tags') && (
              <DataTableFacetedFilter column={table.getColumn('tags')} title="Tags" options={tagOptions} />
            )}
            {isFiltered && (
              <Button variant="ghost" size="sm" onClick={() => table.resetColumnFilters()}>
                Clear
              </Button>
            )}
          </div>
          <Button size="sm" onClick={() => setNewOpen(true)}>
            <HugeiconsIcon icon={Add01Icon} strokeWidth={2} data-icon="inline-start" />
            New dataset
          </Button>
        </div>

        {!hasRows ? (
          <Empty>
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <HugeiconsIcon icon={Database01Icon} strokeWidth={2} />
              </EmptyMedia>
              <EmptyTitle>No datasets</EmptyTitle>
              <EmptyDescription>
                {isFiltered
                  ? 'No datasets match the current filters.'
                  : 'Capture questions from a trace, upload a CSV, or add them by hand to get started.'}
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : (
          <DataGridBody
            table={table}
            onRowClick={(d) => navigate({ to: '/datasets/$datasetId', params: { datasetId: d.id } })}
          />
        )}
      </div>

      <NewDatasetDialog
        open={newOpen}
        onClose={() => setNewOpen(false)}
        onCreated={(id) => navigate({ to: '/datasets/$datasetId', params: { datasetId: id } })}
      />
    </Page>
  )
}

function NewDatasetDialog({
  open,
  onClose,
  onCreated,
}: {
  open: boolean
  onClose: () => void
  onCreated: (id: string) => void
}) {
  const queryClient = useQueryClient()
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [tags, setTags] = useState('')

  const reset = () => {
    setName('')
    setDescription('')
    setTags('')
  }

  const createMutation = useMutation({
    mutationFn: () =>
      createDataset({
        data: {
          name,
          description: description.trim() || null,
          tags: tags
            .split(',')
            .map((t) => t.trim())
            .filter(Boolean),
        },
      }),
    onSuccess: async (ds) => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.datasets.all() })
      toast.success('Dataset created')
      reset()
      onClose()
      onCreated(ds.id)
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : String(err)),
  })

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New dataset</DialogTitle>
          <DialogDescription>Name it now; add example questions on the next screen.</DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-4 py-2">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="ds-name">Name</Label>
            <Input
              id="ds-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Regression set"
              autoFocus
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="ds-desc">Description</Label>
            <Textarea
              id="ds-desc"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
              placeholder="What this set covers…"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="ds-tags">Tags</Label>
            <Input
              id="ds-tags"
              value={tags}
              onChange={(e) => setTags(e.target.value)}
              placeholder="regression, billing (comma-separated)"
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={() => createMutation.mutate()} disabled={!name.trim() || createMutation.isPending}>
            Create
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
