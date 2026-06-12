import { useQuery } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import {
  type ColumnFiltersState,
  flexRender,
  getCoreRowModel,
  getFacetedRowModel,
  getFacetedUniqueValues,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  type SortingState,
  useReactTable,
  type VisibilityState,
} from '@tanstack/react-table'
import * as React from 'react'
import type { AutoRefreshInterval } from '#/components/auto-refresh-select'
import { DataTablePagination } from '#/components/data-table-pagination'
import { DataTableToolbar, type FacetedFilterSpec } from '#/components/data-table-toolbar'
import { ScopedEmptyState } from '#/components/scoped-empty-state'
import { Spinner } from '#/components/spinner'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '#/components/ui/table'
import { ListScoreActions, scoreSummariesQuery } from '#/features/evaluation'
import { getNoteFlagsForKind } from '#/features/notes/server'
import { useScopeToMe, useUserId } from '#/hooks/use-user'
import { queryKeys } from '#/lib/query-keys'
import type { SessionSummary } from '#/lib/telemetry'
import type { TimeRange } from '#/lib/time-range'
import { cn } from '#/lib/utils'
import { buildSessionColumns } from './columns'

const FILTERS: FacetedFilterSpec[] = [
  {
    columnId: 'status',
    title: 'Status',
    options: [
      { label: 'OK', value: 'ok' },
      { label: 'Error', value: 'error' },
    ],
  },
  {
    columnId: 'scoreFlag',
    title: 'Score',
    options: [
      { label: 'Needs attention', value: 'bad' },
      { label: 'Disagreement', value: 'disagreement' },
      { label: 'Scored', value: 'scored' },
      { label: 'Unscored', value: 'unscored' },
    ],
  },
]

interface DataTableProps {
  data: SessionSummary[]
  isLoading?: boolean
  onRowClick?: (row: SessionSummary) => void
  rowClassName?: (row: SessionSummary) => string | undefined
  range: TimeRange
  onRangeChange: (range: TimeRange) => void
  autoRefresh: AutoRefreshInterval
  onAutoRefreshChange: (interval: AutoRefreshInterval) => void
  onRefresh: () => void
  refreshing?: boolean
}

export function DataTable({
  data,
  isLoading,
  onRowClick,
  rowClassName,
  range,
  onRangeChange,
  autoRefresh,
  onAutoRefreshChange,
  onRefresh,
  refreshing,
}: DataTableProps) {
  const [userId] = useUserId()
  const [scopeToMe] = useScopeToMe()
  const [columnVisibility, setColumnVisibility] = React.useState<VisibilityState>({ status: false, scoreFlag: false })
  const [columnFilters, setColumnFilters] = React.useState<ColumnFiltersState>([])
  const [sorting, setSorting] = React.useState<SortingState>([])
  const [pagination, setPagination] = React.useState({
    pageIndex: 0,
    pageSize: 50,
  })

  const { data: noteFlags } = useQuery({
    queryKey: queryKeys.notes.flagsForKind('session'),
    queryFn: () => getNoteFlagsForKind({ data: 'session' }),
  })
  const { data: scoreSummaries } = useQuery(scoreSummariesQuery('session'))
  const columns = React.useMemo(
    () => buildSessionColumns(noteFlags ?? {}, scoreSummaries ?? {}),
    [noteFlags, scoreSummaries],
  )

  const table = useReactTable({
    data,
    columns,
    state: {
      sorting,
      columnVisibility,
      columnFilters,
      pagination,
    },
    getRowId: (row) => row.sessionId,
    onSortingChange: setSorting,
    onColumnFiltersChange: setColumnFilters,
    onColumnVisibilityChange: setColumnVisibility,
    onPaginationChange: setPagination,
    getCoreRowModel: getCoreRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFacetedRowModel: getFacetedRowModel(),
    getFacetedUniqueValues: getFacetedUniqueValues(),
  })

  return (
    <div className="flex h-full w-full flex-col">
      <DataTableToolbar
        table={table}
        searchColumnId="sessionId"
        searchPlaceholder="Search agents, users, ids…"
        filters={FILTERS}
        range={range}
        onRangeChange={onRangeChange}
        autoRefresh={autoRefresh}
        onAutoRefreshChange={onAutoRefreshChange}
        onRefresh={onRefresh}
        refreshing={refreshing}
        actions={
          <ListScoreActions
            table={table}
            buildReviewItem={(session) => ({
              targetKind: 'session',
              targetId: session.sessionId,
              parentSessionId: session.sessionId,
              title: session.title ?? session.sessionId,
              previewText: session.firstInput ?? null,
            })}
          />
        }
      />
      <div className="flex min-h-0 flex-1 flex-col border-t">
        <div className="min-h-0 flex-1 overflow-hidden overflow-y-auto bg-background">
          <Table>
            <TableHeader className="sticky top-0 z-10 bg-muted/40 [&_th]:font-normal [&_th]:text-muted-foreground [&_button]:font-normal [&_button]:text-muted-foreground">
              {table.getHeaderGroups().map((headerGroup) => (
                <TableRow
                  key={headerGroup.id}
                  className="[&>:first-child]:pl-4 [&>:last-child]:pr-4 lg:[&>:first-child]:pl-6 lg:[&>:last-child]:pr-6"
                >
                  {headerGroup.headers.map((header) => (
                    <TableHead key={header.id} colSpan={header.colSpan}>
                      {header.isPlaceholder ? null : flexRender(header.column.columnDef.header, header.getContext())}
                    </TableHead>
                  ))}
                </TableRow>
              ))}
            </TableHeader>
            <TableBody>
              {table.getRowModel().rows.length > 0 ? (
                table.getRowModel().rows.map((row) => (
                  <TableRow
                    key={row.id}
                    className={cn(
                      'h-12 [&>:first-child]:pl-4 [&>:last-child]:pr-4 lg:[&>:first-child]:pl-6 lg:[&>:last-child]:pr-6',
                      onRowClick && 'cursor-pointer',
                      rowClassName?.(row.original),
                    )}
                    onClick={onRowClick ? () => onRowClick(row.original) : undefined}
                  >
                    {row.getVisibleCells().map((cell) => (
                      <TableCell key={cell.id}>{flexRender(cell.column.columnDef.cell, cell.getContext())}</TableCell>
                    ))}
                  </TableRow>
                ))
              ) : (
                <TableRow className="hover:bg-transparent">
                  <TableCell colSpan={columns.length} className="h-48">
                    <div className="flex h-full items-center justify-center">
                      {isLoading ? (
                        <Spinner size="md" className="text-muted-foreground" />
                      ) : scopeToMe && userId ? (
                        <ScopedEmptyState entity="sessions" />
                      ) : (
                        <div className="max-w-md space-y-1 text-center text-pretty text-muted-foreground">
                          <div>No sessions in this window.</div>
                          <div className="text-xs">
                            Set <code className="rounded bg-muted px-1 py-0.5 font-mono">gen_ai.conversation.id</code>{' '}
                            or <code className="rounded bg-muted px-1 py-0.5 font-mono">ag_ui.thread_id</code> on the
                            producer to enable session grouping. Individual traces appear on{' '}
                            <Link to="/traces" className="underline">
                              /traces
                            </Link>
                            .
                          </div>
                        </div>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </div>
      <DataTablePagination table={table} />
    </div>
  )
}
