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
import { DataTableToolbar, type FacetedFilterSpec, type ServerFilters } from '#/components/data-table-toolbar'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '#/components/ui/table'
import type { TimeRange } from '#/lib/time-range'
import { cn } from '#/lib/utils'

interface TelemetryDataTableProps<TData> {
  data: TData[]
  columns: ColumnDef<TData>[]
  getRowId: (row: TData) => string
  filters: FacetedFilterSpec[]
  // When set, category/kind/status/search run server-side (URL params → fetch)
  // instead of TanStack column filters on the single fetched page.
  serverFilters?: ServerFilters
  searchColumnId: string
  searchPlaceholder: string
  defaultColumnVisibility?: VisibilityState
  extraFilters?: React.ReactNode
  actions?: (table: TanstackTable<TData>) => React.ReactNode
  emptyState: (ctx: { isLoading?: boolean }) => React.ReactNode
  isLoading?: boolean
  onRowClick?: (row: TData) => void
  rowClassName?: (row: TData) => string | undefined
  range: TimeRange
  onRangeChange: (range: TimeRange) => void
  autoRefresh: AutoRefreshInterval
  onAutoRefreshChange: (interval: AutoRefreshInterval) => void
  onRefresh: () => void
  refreshing?: boolean
  // When set, paging is server-driven: `data` is the current page, and prev/next
  // drive `onPageChange` instead of slicing client-side. Omit for the default
  // client-side pagination (small app-DB tables).
  serverPagination?: { pageIndex: number; hasMore: boolean; onPageChange: (pageIndex: number) => void }
}

export function TelemetryDataTable<TData>({
  data,
  columns,
  getRowId,
  filters,
  serverFilters,
  searchColumnId,
  searchPlaceholder,
  defaultColumnVisibility,
  extraFilters,
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
  serverPagination,
}: TelemetryDataTableProps<TData>) {
  const [columnVisibility, setColumnVisibility] = React.useState<VisibilityState>(defaultColumnVisibility ?? {})
  const [columnFilters, setColumnFilters] = React.useState<ColumnFiltersState>([])
  const [sorting, setSorting] = React.useState<SortingState>([])
  const [pagination, setPagination] = React.useState({
    pageIndex: 0,
    pageSize: 50,
  })
  // Server-paged: render the whole fetched page (one client page), server nav
  // handles the rest. Client-paged: the usual 50/page slicing.
  const effectivePagination = serverPagination ? { pageIndex: 0, pageSize: Math.max(data.length, 1) } : pagination

  const table = useReactTable({
    data,
    columns,
    state: {
      sorting,
      columnVisibility,
      columnFilters,
      pagination: effectivePagination,
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
        serverFilters={serverFilters}
        extraFilters={extraFilters}
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
                      '[&>:first-child]:pl-4 [&>:last-child]:pr-4 lg:[&>:first-child]:pl-6 lg:[&>:last-child]:pr-6',
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
                    <div className="flex h-full items-center justify-center">{emptyState({ isLoading })}</div>
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </div>
      <DataTablePagination table={table} server={serverPagination} />
    </div>
  )
}
