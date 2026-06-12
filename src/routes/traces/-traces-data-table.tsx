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
import { ListScoreActions } from '#/features/evaluation'
import { useScopeToMe, useUserId } from '#/hooks/use-user'
import type { ScoreSummary } from '#/lib/eval/evaluation'
import type { TraceSummary } from '#/lib/telemetry'
import type { TimeRange } from '#/lib/time-range'
import { cn } from '#/lib/utils'
import { makeTraceColumns } from './-columns'

const FILTERS: FacetedFilterSpec[] = [
  {
    columnId: 'category',
    title: 'Category',
    options: [
      { label: 'Chat', value: 'chat' },
      { label: 'Sub-agent', value: 'sub-agent' },
      { label: 'Scheduled', value: 'scheduled' },
      { label: 'Event', value: 'event' },
      { label: 'Webhook', value: 'webhook' },
      { label: 'Background', value: 'background' },
      { label: 'Utility', value: 'utility' },
      { label: 'Orphan', value: 'orphan' },
    ],
  },
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

interface TracesDataTableProps {
  data: TraceSummary[]
  isLoading?: boolean
  onRowClick?: (row: TraceSummary) => void
  range: TimeRange
  onRangeChange: (range: TimeRange) => void
  autoRefresh: AutoRefreshInterval
  onAutoRefreshChange: (interval: AutoRefreshInterval) => void
  onRefresh: () => void
  refreshing?: boolean
  scoreSummaries?: Record<string, ScoreSummary>
}

export function TracesDataTable({
  data,
  isLoading,
  onRowClick,
  range,
  onRangeChange,
  autoRefresh,
  onAutoRefreshChange,
  onRefresh,
  refreshing,
  scoreSummaries,
}: TracesDataTableProps) {
  const [userId] = useUserId()
  const [scopeToMe] = useScopeToMe()
  const columns = React.useMemo(() => makeTraceColumns(scoreSummaries ?? {}), [scoreSummaries])
  const [columnVisibility, setColumnVisibility] = React.useState<VisibilityState>({
    status: false,
    category: false,
    scoreFlag: false,
  })
  const [columnFilters, setColumnFilters] = React.useState<ColumnFiltersState>([])
  const [sorting, setSorting] = React.useState<SortingState>([])
  const [pagination, setPagination] = React.useState({
    pageIndex: 0,
    pageSize: 50,
  })

  const table = useReactTable({
    data,
    columns,
    state: {
      sorting,
      columnVisibility,
      columnFilters,
      pagination,
    },
    getRowId: (row) => row.id,
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
        searchColumnId="id"
        searchPlaceholder="Search traces, agents, users…"
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
            buildReviewItem={(trace) => ({
              targetKind: 'trace',
              targetId: trace.id,
              parentTraceId: trace.id,
              title: trace.id,
              traceId: trace.id,
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
                        <ScopedEmptyState entity="traces" />
                      ) : (
                        <div className="text-muted-foreground">No traces in this window.</div>
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
