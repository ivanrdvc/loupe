import {
  type ColumnDef,
  type ColumnFiltersState,
  flexRender,
  getCoreRowModel,
  getFacetedUniqueValues,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  type SortingState,
  useReactTable,
  type VisibilityState,
} from '@tanstack/react-table'
import * as React from 'react'
import { DataTablePagination } from '#/components/data-table-pagination'
import type { FacetedFilterSpec } from '#/components/data-table-toolbar'
import { Spinner } from '#/components/spinner'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '#/components/ui/table'
import { McpTableToolbar } from './-mcp-table-toolbar'

interface McpDataTableProps<TData> {
  columns: ColumnDef<TData>[]
  data: TData[]
  getRowId: (row: TData) => string
  searchColumnId?: string
  searchPlaceholder?: string
  filters?: FacetedFilterSpec[]
  initialSorting?: SortingState
  emptyMessage: string
  isLoading?: boolean
  onRefresh?: () => void
  refreshing?: boolean
  toolbarActions?: React.ReactNode
}

export function McpDataTable<TData>({
  columns,
  data,
  getRowId,
  searchColumnId,
  searchPlaceholder,
  filters,
  initialSorting = [],
  emptyMessage,
  isLoading,
  onRefresh,
  refreshing,
  toolbarActions,
}: McpDataTableProps<TData>) {
  const [sorting, setSorting] = React.useState<SortingState>(initialSorting)
  const [columnVisibility, setColumnVisibility] = React.useState<VisibilityState>({})
  const [columnFilters, setColumnFilters] = React.useState<ColumnFiltersState>([])
  const [pagination, setPagination] = React.useState({ pageIndex: 0, pageSize: 50 })

  const table = useReactTable({
    data,
    columns,
    state: { sorting, columnVisibility, columnFilters, pagination },
    getRowId,
    onSortingChange: setSorting,
    onColumnFiltersChange: setColumnFilters,
    onColumnVisibilityChange: setColumnVisibility,
    onPaginationChange: setPagination,
    getCoreRowModel: getCoreRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getFacetedUniqueValues: getFacetedUniqueValues(),
    getPaginationRowModel: getPaginationRowModel(),
    getSortedRowModel: getSortedRowModel(),
  })

  return (
    <div className="flex h-full w-full flex-col">
      <McpTableToolbar
        table={table}
        searchColumnId={searchColumnId}
        searchPlaceholder={searchPlaceholder}
        filters={filters}
        onRefresh={onRefresh}
        refreshing={refreshing}
        actions={toolbarActions}
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
                    className="h-12 [&>:first-child]:pl-4 [&>:last-child]:pr-4 lg:[&>:first-child]:pl-6 lg:[&>:last-child]:pr-6"
                  >
                    {row.getVisibleCells().map((cell) => (
                      <TableCell key={cell.id}>{flexRender(cell.column.columnDef.cell, cell.getContext())}</TableCell>
                    ))}
                  </TableRow>
                ))
              ) : (
                <TableRow className="hover:bg-transparent">
                  <TableCell colSpan={columns.length} className="h-48">
                    <div className="flex h-full items-center justify-center text-muted-foreground">
                      {isLoading ? <Spinner size="md" className="text-muted-foreground" /> : <div>{emptyMessage}</div>}
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
