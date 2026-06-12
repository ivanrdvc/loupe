import {
  type ColumnDef,
  type ColumnFiltersState,
  flexRender,
  getCoreRowModel,
  getFacetedRowModel,
  getFacetedUniqueValues,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  type SortingState,
  type Table as TanstackTable,
  useReactTable,
  type VisibilityState,
} from '@tanstack/react-table'
import * as React from 'react'
import type { AutoRefreshInterval } from '#/components/auto-refresh-select'
import { DataTablePagination } from '#/components/data-table-pagination'
import { DataTableToolbar, type FacetedFilterSpec } from '#/components/data-table-toolbar'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '#/components/ui/table'
import { useScopeToMe, useUserId } from '#/hooks/use-user'
import type { TimeRange } from '#/lib/time-range'
import { cn } from '#/lib/utils'

interface TelemetryDataTableProps<TData> {
  data: TData[]
  columns: ColumnDef<TData>[]
  getRowId: (row: TData) => string
  filters: FacetedFilterSpec[]
  searchColumnId: string
  searchPlaceholder: string
  defaultColumnVisibility?: VisibilityState
  actions?: (table: TanstackTable<TData>) => React.ReactNode
  emptyState: (ctx: { isLoading?: boolean; scopeToMe: boolean; userId: string }) => React.ReactNode
  isLoading?: boolean
  onRowClick?: (row: TData) => void
  rowClassName?: (row: TData) => string | undefined
  range: TimeRange
  onRangeChange: (range: TimeRange) => void
  autoRefresh: AutoRefreshInterval
  onAutoRefreshChange: (interval: AutoRefreshInterval) => void
  onRefresh: () => void
  refreshing?: boolean
}

export function TelemetryDataTable<TData>({
  data,
  columns,
  getRowId,
  filters,
  searchColumnId,
  searchPlaceholder,
  defaultColumnVisibility,
  actions,
  emptyState,
  isLoading,
  onRowClick,
  rowClassName,
  range,
  onRangeChange,
  autoRefresh,
  onAutoRefreshChange,
  onRefresh,
  refreshing,
}: TelemetryDataTableProps<TData>) {
  const [userId] = useUserId()
  const [scopeToMe] = useScopeToMe()
  const [columnVisibility, setColumnVisibility] = React.useState<VisibilityState>(defaultColumnVisibility ?? {})
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
    getRowId,
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
        searchColumnId={searchColumnId}
        searchPlaceholder={searchPlaceholder}
        filters={filters}
        range={range}
        onRangeChange={onRangeChange}
        autoRefresh={autoRefresh}
        onAutoRefreshChange={onAutoRefreshChange}
        onRefresh={onRefresh}
        refreshing={refreshing}
        actions={actions?.(table)}
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
                      {emptyState({ isLoading, scopeToMe, userId })}
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
