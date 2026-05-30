import { Add01Icon, Database01Icon, PlayCircleIcon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { IconSearch } from '@tabler/icons-react'
import { createFileRoute, useNavigate } from '@tanstack/react-router'
import type { ColumnDef } from '@tanstack/react-table'
import { useMemo, useState } from 'react'
import { toast } from 'sonner'
import { Page } from '#/components/page'
import { Badge } from '#/components/ui/badge'
import { Button } from '#/components/ui/button'
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '#/components/ui/empty'
import { Input } from '#/components/ui/input'
import { Tooltip, TooltipContent, TooltipTrigger } from '#/components/ui/tooltip'
import { DataGrid } from './-components/data-grid'
import { type Dataset, exampleCount, listDatasets, runCount } from './-data'

export const Route = createFileRoute('/datasets/')({
  component: DatasetsListPage,
})

const columns: ColumnDef<Dataset, unknown>[] = [
  {
    id: 'name',
    header: 'Name',
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
    cell: ({ row }) => exampleCount(row.original.id),
    meta: { className: 'text-right font-mono text-sm tabular-nums', headClassName: 'w-24 text-right' },
  },
  {
    id: 'runs',
    header: 'Runs',
    cell: ({ row }) => runCount(row.original.id),
    meta: { className: 'text-right font-mono text-sm tabular-nums', headClassName: 'w-20 text-right' },
  },
  {
    id: 'lastRun',
    header: 'Last run',
    cell: ({ row }) => <span className="text-sm text-muted-foreground">{row.original.lastRunAt ?? '—'}</span>,
    meta: { headClassName: 'w-28' },
  },
  {
    id: 'updated',
    header: 'Updated',
    cell: ({ row }) => <span className="text-sm text-muted-foreground">{row.original.updatedAt}</span>,
    meta: { headClassName: 'w-28' },
  },
  {
    id: 'tags',
    header: 'Tags',
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
            onClick={(e) => {
              e.stopPropagation()
              toast.info(`Run “${row.original.name}” on default agent — UI mock`)
            }}
          >
            <HugeiconsIcon icon={PlayCircleIcon} strokeWidth={2} />
          </Button>
        </TooltipTrigger>
        <TooltipContent>Run on default agent</TooltipContent>
      </Tooltip>
    ),
    meta: { headClassName: 'w-12' },
  },
]

function DatasetsListPage() {
  const navigate = useNavigate()
  const [search, setSearch] = useState('')
  const datasets = useMemo(
    () => listDatasets().filter((d) => d.name.toLowerCase().includes(search.trim().toLowerCase())),
    [search],
  )

  return (
    <Page title="Datasets">
      <div className="flex min-h-0 flex-1 flex-col">
        <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 lg:px-6">
          <div className="relative w-full min-w-0 sm:w-72">
            <IconSearch className="pointer-events-none absolute top-1/2 left-2 size-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search datasets…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="h-8 w-full pl-7"
            />
          </div>
          <Button size="sm" onClick={() => toast.info('New dataset — UI mock')}>
            <HugeiconsIcon icon={Add01Icon} strokeWidth={2} data-icon="inline-start" />
            New dataset
          </Button>
        </div>

        {datasets.length === 0 ? (
          <Empty>
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <HugeiconsIcon icon={Database01Icon} strokeWidth={2} />
              </EmptyMedia>
              <EmptyTitle>No datasets</EmptyTitle>
              <EmptyDescription>
                Capture questions from a trace, upload a CSV, or add them by hand to get started.
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : (
          <DataGrid
            columns={columns}
            data={datasets}
            getRowId={(d) => d.id}
            onRowClick={(d) => navigate({ to: '/datasets/$datasetId', params: { datasetId: d.id } })}
          />
        )}
      </div>
    </Page>
  )
}
