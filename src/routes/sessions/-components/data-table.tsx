import { Loading03Icon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { IconChevronLeft, IconChevronRight, IconChevronsLeft, IconChevronsRight } from '@tabler/icons-react'
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
import { DataTableToolbar, type FacetedFilterSpec } from '#/components/data-table-toolbar'
import { Button } from '#/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '#/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '#/components/ui/table'
import { useScopeToMe, useUserId } from '#/hooks/use-user'
import type { SessionSummary } from '#/lib/telemetry'
import type { TimeRange } from '#/lib/time-range'
import { cn } from '#/lib/utils'
import { sessionColumns } from './columns'

const FILTERS: FacetedFilterSpec[] = [
  {
    columnId: 'status',
    title: 'Status',
    options: [
      { label: 'OK', value: 'ok' },
      { label: 'Error', value: 'error' },
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
  const [columnVisibility, setColumnVisibility] = React.useState<VisibilityState>({ status: false })
  const [columnFilters, setColumnFilters] = React.useState<ColumnFiltersState>([])
  const [sorting, setSorting] = React.useState<SortingState>([])
  const [pagination, setPagination] = React.useState({
    pageIndex: 0,
    pageSize: 50,
  })

  const table = useReactTable({
    data,
    columns: sessionColumns,
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
      />
      <div className="flex min-h-0 flex-1 flex-col px-4 pb-4 md:pb-6 lg:px-6">
        <div className="min-h-0 flex-1 overflow-hidden overflow-y-auto rounded-lg border bg-background">
          <Table>
            <TableHeader className="sticky top-0 z-10 bg-muted">
              {table.getHeaderGroups().map((headerGroup) => (
                <TableRow key={headerGroup.id} className="h-12">
                  {headerGroup.headers.map((header) => (
                    <TableHead key={header.id} colSpan={header.colSpan} className="h-12">
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
                    className={cn('h-12', onRowClick && 'cursor-pointer', rowClassName?.(row.original))}
                    onClick={onRowClick ? () => onRowClick(row.original) : undefined}
                  >
                    {row.getVisibleCells().map((cell) => (
                      <TableCell key={cell.id}>{flexRender(cell.column.columnDef.cell, cell.getContext())}</TableCell>
                    ))}
                  </TableRow>
                ))
              ) : (
                <TableRow className="hover:bg-transparent">
                  <TableCell colSpan={sessionColumns.length} className="h-48">
                    <div className="flex h-full items-center justify-center">
                      {isLoading ? (
                        <HugeiconsIcon
                          icon={Loading03Icon}
                          strokeWidth={2}
                          className="size-4 animate-spin text-muted-foreground"
                        />
                      ) : scopeToMe && userId ? (
                        <div className="max-w-md space-y-1 text-center text-muted-foreground">
                          <div>
                            No sessions for <span className="font-mono text-foreground">{userId}</span>.
                          </div>
                          <div className="text-xs">Turn off scope-to-me in Settings → Account to see all sessions.</div>
                        </div>
                      ) : (
                        <div className="max-w-md space-y-1 text-center text-pretty text-muted-foreground">
                          <div>No sessions in this window.</div>
                          <div className="text-xs">
                            Set <code className="rounded bg-muted px-1 py-0.5 font-mono">ag_ui.thread_id</code> (or your
                            configured{' '}
                            <code className="rounded bg-muted px-1 py-0.5 font-mono">CUSTOM_SESSION_ID_FIELDS</code>) on
                            the producer to enable session grouping. Individual traces appear on{' '}
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
      <div className="-mx-0 -mb-4 shrink-0 border-t bg-background md:-mb-6">
        <div className="flex flex-wrap items-center justify-end gap-3 px-4 py-3 lg:px-6">
          <div className="flex items-center gap-4 lg:gap-6">
            <div className="hidden items-center gap-2 lg:flex">
              <p className="text-xs font-medium">Rows per page</p>
              <Select
                value={`${table.getState().pagination.pageSize}`}
                onValueChange={(value) => table.setPageSize(Number(value))}
              >
                <SelectTrigger size="sm" className="w-[68px]" id="rows-per-page">
                  <SelectValue placeholder={table.getState().pagination.pageSize} />
                </SelectTrigger>
                <SelectContent side="top">
                  {[25, 50, 100, 200].map((pageSize) => (
                    <SelectItem key={pageSize} value={`${pageSize}`}>
                      {pageSize}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex w-[96px] items-center justify-center text-xs font-medium">
              Page {table.getState().pagination.pageIndex + 1} of {Math.max(table.getPageCount(), 1)}
            </div>
            <div className="flex items-center gap-1">
              <Button
                variant="outline"
                size="icon-sm"
                className="hidden lg:flex"
                onClick={() => table.setPageIndex(0)}
                disabled={!table.getCanPreviousPage()}
              >
                <span className="sr-only">First page</span>
                <IconChevronsLeft />
              </Button>
              <Button
                variant="outline"
                size="icon-sm"
                onClick={() => table.previousPage()}
                disabled={!table.getCanPreviousPage()}
              >
                <span className="sr-only">Previous page</span>
                <IconChevronLeft />
              </Button>
              <Button
                variant="outline"
                size="icon-sm"
                onClick={() => table.nextPage()}
                disabled={!table.getCanNextPage()}
              >
                <span className="sr-only">Next page</span>
                <IconChevronRight />
              </Button>
              <Button
                variant="outline"
                size="icon-sm"
                className="hidden lg:flex"
                onClick={() => table.setPageIndex(table.getPageCount() - 1)}
                disabled={!table.getCanNextPage()}
              >
                <span className="sr-only">Last page</span>
                <IconChevronsRight />
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
