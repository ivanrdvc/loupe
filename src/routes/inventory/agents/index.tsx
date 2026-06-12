import { queryOptions, useQuery } from '@tanstack/react-query'
import { createFileRoute, Link } from '@tanstack/react-router'
import {
  type ColumnDef,
  flexRender,
  getCoreRowModel,
  getExpandedRowModel,
  getFilteredRowModel,
  getSortedRowModel,
  type SortingState,
  useReactTable,
} from '@tanstack/react-table'
import { ChevronRight, Search } from 'lucide-react'
import { Fragment, useMemo, useState } from 'react'
import { CopyButton } from '#/components/copy-button'
import { DataTableColumnHeader } from '#/components/data-table-column-header'
import { Page } from '#/components/page'
import { RelativeTime } from '#/components/relative-time'
import { Badge } from '#/components/ui/badge'
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from '#/components/ui/empty'
import { Input } from '#/components/ui/input'
import { Skeleton } from '#/components/ui/skeleton'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '#/components/ui/table'
import { type AgentRow, listAgents } from '#/features/inventory/agents/server'
import { formatDuration, formatPercent } from '#/lib/format'
import { cn } from '#/lib/utils'

const agentsQuery = queryOptions({
  queryKey: ['agents', 'list'] as const,
  queryFn: () => listAgents(),
})

export const Route = createFileRoute('/inventory/agents/')({
  loader: ({ context }) => context.queryClient.ensureQueryData(agentsQuery),
  component: AgentsPage,
})

const columns: ColumnDef<AgentRow>[] = [
  {
    accessorKey: 'name',
    header: ({ column }) => <DataTableColumnHeader column={column} title="Name" />,
    cell: ({ row }) => (
      <div className="flex min-w-0 items-start gap-1.5">
        <ChevronRight
          aria-hidden
          className="mt-0.5 size-3.5 shrink-0 text-muted-foreground transition-transform data-[open=true]:rotate-90"
          data-open={row.getIsExpanded()}
        />
        <span className="flex min-w-0 max-w-[28rem] flex-col gap-0.5">
          <span className="truncate font-medium text-foreground">{row.original.name}</span>
          {row.original.description && (
            <span className="truncate text-xs text-muted-foreground">{row.original.description}</span>
          )}
        </span>
      </div>
    ),
    filterFn: (row, _id, value) => {
      const q = String(value ?? '')
        .trim()
        .toLowerCase()
      if (!q) return true
      return (
        row.original.name.toLowerCase().includes(q) || (row.original.description?.toLowerCase().includes(q) ?? false)
      )
    },
  },
  {
    accessorKey: 'kind',
    header: ({ column }) => <DataTableColumnHeader column={column} title="Type" />,
    cell: ({ row }) =>
      row.original.kind === 'main' ? (
        <Badge variant="outline">Main</Badge>
      ) : (
        <Badge variant="secondary">Subagent</Badge>
      ),
  },
  {
    accessorKey: 'calls',
    header: ({ column }) => <DataTableColumnHeader column={column} title="Calls" className="justify-end" />,
    cell: ({ row }) => <div className="text-right tabular-nums">{row.original.calls.toLocaleString()}</div>,
  },
  {
    accessorKey: 'errorRate',
    header: ({ column }) => <DataTableColumnHeader column={column} title="Error rate" className="justify-end" />,
    cell: ({ row }) => (
      <div className="text-right tabular-nums">
        {row.original.calls > 0 ? (
          formatPercent(row.original.errorRate, 1)
        ) : (
          <span className="text-muted-foreground">—</span>
        )}
      </div>
    ),
  },
  {
    accessorKey: 'p50Ms',
    header: ({ column }) => <DataTableColumnHeader column={column} title="p50" className="justify-end" />,
    cell: ({ row }) => (
      <div className="text-right tabular-nums">
        {row.original.p50Ms > 0 ? formatDuration(row.original.p50Ms) : <span className="text-muted-foreground">—</span>}
      </div>
    ),
  },
  {
    accessorKey: 'p95Ms',
    header: ({ column }) => <DataTableColumnHeader column={column} title="p95" className="justify-end" />,
    cell: ({ row }) => (
      <div className="text-right tabular-nums">
        {row.original.p95Ms > 0 ? formatDuration(row.original.p95Ms) : <span className="text-muted-foreground">—</span>}
      </div>
    ),
  },
  {
    accessorKey: 'lastSeenAtMs',
    header: ({ column }) => <DataTableColumnHeader column={column} title="Last seen" />,
    cell: ({ row }) => (
      <RelativeTime ts={row.original.lastSeenAtMs} className="whitespace-nowrap tabular-nums text-muted-foreground" />
    ),
    sortingFn: (a, b) => a.original.lastSeenAtMs - b.original.lastSeenAtMs,
  },
]

function AgentsPage() {
  const { data, isLoading } = useQuery(agentsQuery)
  const [filter, setFilter] = useState('')
  const [sorting, setSorting] = useState<SortingState>([{ id: 'lastSeenAtMs', desc: true }])

  const rows = useMemo(() => data ?? [], [data])

  const table = useReactTable({
    data: rows,
    columns,
    state: { sorting, globalFilter: filter },
    onSortingChange: setSorting,
    onGlobalFilterChange: setFilter,
    getRowId: (row) => String(row.id),
    getRowCanExpand: () => true,
    globalFilterFn: (row, _id, value) => {
      const q = String(value ?? '')
        .trim()
        .toLowerCase()
      if (!q) return true
      return (
        row.original.name.toLowerCase().includes(q) || (row.original.description?.toLowerCase().includes(q) ?? false)
      )
    },
    getCoreRowModel: getCoreRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getExpandedRowModel: getExpandedRowModel(),
  })

  const rowPad = '[&>:first-child]:pl-4 [&>:last-child]:pr-4 lg:[&>:first-child]:pl-6 lg:[&>:last-child]:pr-6'

  return (
    <Page title="Agents">
      <div className="flex min-w-0 flex-col">
        <div className="flex flex-wrap items-center gap-2 px-4 py-3 lg:px-6">
          <div className="relative w-full min-w-0 sm:w-64">
            <Search
              className="pointer-events-none absolute top-1/2 left-2 size-3.5 -translate-y-1/2 text-muted-foreground"
              aria-hidden
            />
            <Input
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              placeholder="Filter agents…"
              className="h-8 w-full pl-7"
            />
          </div>
        </div>

        {isLoading ? (
          <div className="flex flex-col gap-2 p-4 lg:p-6">
            {Array.from({ length: 4 }).map((_, i) => (
              // biome-ignore lint/suspicious/noArrayIndexKey: skeleton placeholders
              <Skeleton key={i} className="h-10 w-full" />
            ))}
          </div>
        ) : rows.length > 0 ? (
          <div className="border-t bg-background">
            <Table>
              <TableHeader className="bg-muted/40 [&_th]:font-normal [&_th]:text-muted-foreground [&_button]:font-normal [&_button]:text-muted-foreground">
                {table.getHeaderGroups().map((hg) => (
                  <TableRow key={hg.id} className={rowPad}>
                    {hg.headers.map((header) => (
                      <TableHead key={header.id}>
                        {header.isPlaceholder ? null : flexRender(header.column.columnDef.header, header.getContext())}
                      </TableHead>
                    ))}
                  </TableRow>
                ))}
              </TableHeader>
              <TableBody>
                {table.getRowModel().rows.map((row) => (
                  <Fragment key={row.id}>
                    <TableRow className={cn('cursor-pointer', rowPad)} onClick={row.getToggleExpandedHandler()}>
                      {row.getVisibleCells().map((cell) => (
                        <TableCell key={cell.id}>{flexRender(cell.column.columnDef.cell, cell.getContext())}</TableCell>
                      ))}
                    </TableRow>
                    {row.getIsExpanded() && (
                      <TableRow className={cn('hover:bg-transparent', rowPad)}>
                        <TableCell colSpan={columns.length} className="bg-muted/20">
                          <AgentPrompt agent={row.original} />
                        </TableCell>
                      </TableRow>
                    )}
                  </Fragment>
                ))}
              </TableBody>
            </Table>
          </div>
        ) : (
          <div className="p-4 lg:p-6">
            <Empty>
              <EmptyHeader>
                <EmptyTitle>No agents discovered yet</EmptyTitle>
                <EmptyDescription>
                  Agents are picked up from traces as they run — they appear here once an <code>invoke_agent</code> span
                  is seen.
                </EmptyDescription>
              </EmptyHeader>
            </Empty>
          </div>
        )}
      </div>
    </Page>
  )
}

function AgentPrompt({ agent }: { agent: AgentRow }) {
  return (
    <div className="flex flex-col gap-2 py-1">
      {agent.systemPrompt ? (
        <div className="relative max-h-80 overflow-auto rounded-md bg-background p-3 pr-9 ring-1 ring-foreground/10">
          <CopyButton value={agent.systemPrompt} className="absolute right-2 top-2" label="Copy prompt" />
          <pre className="whitespace-pre-wrap font-mono text-xs leading-relaxed text-foreground">
            {agent.systemPrompt}
          </pre>
        </div>
      ) : (
        <p className="text-xs text-muted-foreground italic">No system prompt captured.</p>
      )}
      {agent.firstSeenTraceId && (
        <Link
          to="/traces/$traceId"
          params={{ traceId: agent.firstSeenTraceId }}
          className="self-start text-xs text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
          onClick={(e) => e.stopPropagation()}
        >
          First seen in trace ↗
        </Link>
      )}
    </div>
  )
}
