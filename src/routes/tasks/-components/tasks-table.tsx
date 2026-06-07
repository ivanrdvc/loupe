import { IconChevronLeft, IconChevronRight, IconChevronsLeft, IconChevronsRight } from '@tabler/icons-react'
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
import { Spinner } from '#/components/spinner'
import { Button } from '#/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '#/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '#/components/ui/table'
import type { TaskRow } from '#/features/tasks/rollup'
import type { TimeRange } from '#/lib/time-range'
import { cn } from '#/lib/utils'
import { taskColumns } from '../-columns'

const FILTERS: FacetedFilterSpec[] = [
  {
    columnId: 'kind',
    title: 'Kind',
    options: [
      { label: 'Cron', value: 'cron' },
      { label: 'One-shot', value: 'one_shot' },
      { label: 'Event', value: 'event' },
      { label: 'Webhook', value: 'webhook' },
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
]

interface TasksDataTableProps {
  data: TaskRow[]
  isLoading?: boolean
  onRowClick?: (row: TaskRow) => void
  range: TimeRange
  onRangeChange: (range: TimeRange) => void
  autoRefresh: AutoRefreshInterval
  onAutoRefreshChange: (interval: AutoRefreshInterval) => void
  onRefresh: () => void
  refreshing?: boolean
}

export function TasksDataTable({
  data,
  isLoading,
  onRowClick,
  range,
  onRangeChange,
  autoRefresh,
  onAutoRefreshChange,
  onRefresh,
  refreshing,
}: TasksDataTableProps) {
  const [columnVisibility, setColumnVisibility] = React.useState<VisibilityState>({
    status: false,
  })
  const [columnFilters, setColumnFilters] = React.useState<ColumnFiltersState>([])
  const [sorting, setSorting] = React.useState<SortingState>([{ id: 'fires', desc: true }])
  const [pagination, setPagination] = React.useState({ pageIndex: 0, pageSize: 50 })

  const table = useReactTable({
    data,
    columns: taskColumns,
    state: { sorting, columnVisibility, columnFilters, pagination },
    getRowId: (row) => row.key,
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
        searchColumnId="name"
        searchPlaceholder="Search tasks, schedules, agents…"
        filters={FILTERS}
        range={range}
        onRangeChange={onRangeChange}
        autoRefresh={autoRefresh}
        onAutoRefreshChange={onAutoRefreshChange}
        onRefresh={onRefresh}
        refreshing={refreshing}
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
                  <TableCell colSpan={taskColumns.length} className="h-48">
                    <div className="flex h-full items-center justify-center">
                      {isLoading ? (
                        <Spinner size="md" className="text-muted-foreground" />
                      ) : (
                        <div className="text-muted-foreground">No tasks fired in this window.</div>
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
