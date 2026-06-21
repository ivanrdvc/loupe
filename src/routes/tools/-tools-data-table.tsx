import {
  type ColumnFiltersState,
  flexRender,
  getCoreRowModel,
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
import { DataTableToolbar } from '#/components/data-table-toolbar'
import { Spinner } from '#/components/spinner'
import { Input } from '#/components/ui/input'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '#/components/ui/table'
import type { ToolRow } from '#/lib/telemetry'
import { TOOL_DIMENSIONS } from '#/lib/telemetry/conventions'
import type { TimeRange } from '#/lib/time-range'
import { toolColumns } from './-columns'

interface ToolsDataTableProps {
  data: ToolRow[]
  isLoading?: boolean
  sorting: SortingState
  onSortingChange: (next: SortingState) => void
  range: TimeRange
  onRangeChange: (range: TimeRange) => void
  autoRefresh: AutoRefreshInterval
  onAutoRefreshChange: (interval: AutoRefreshInterval) => void
  onRefresh: () => void
  refreshing?: boolean
  dimensions: Record<string, string>
  onDimensionChange: (key: string, value: string) => void
}

export function ToolsDataTable({
  data,
  isLoading,
  sorting,
  onSortingChange,
  range,
  onRangeChange,
  autoRefresh,
  onAutoRefreshChange,
  onRefresh,
  refreshing,
  dimensions,
  onDimensionChange,
}: ToolsDataTableProps) {
  const [columnVisibility, setColumnVisibility] = React.useState<VisibilityState>({})
  const [columnFilters, setColumnFilters] = React.useState<ColumnFiltersState>([])
  const [pagination, setPagination] = React.useState({ pageIndex: 0, pageSize: 50 })

  const table = useReactTable({
    data,
    columns: toolColumns,
    state: { sorting, columnVisibility, columnFilters, pagination },
    getRowId: (row) => row.name,
    onSortingChange: (updater) => {
      const next = typeof updater === 'function' ? updater(sorting) : updater
      onSortingChange(next)
    },
    onColumnFiltersChange: setColumnFilters,
    onColumnVisibilityChange: setColumnVisibility,
    onPaginationChange: setPagination,
    getCoreRowModel: getCoreRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    getSortedRowModel: getSortedRowModel(),
  })

  return (
    <div className="flex h-full w-full flex-col">
      <DataTableToolbar
        table={table}
        searchColumnId="name"
        searchPlaceholder="Filter tools…"
        range={range}
        onRangeChange={onRangeChange}
        autoRefresh={autoRefresh}
        onAutoRefreshChange={onAutoRefreshChange}
        onRefresh={onRefresh}
        refreshing={refreshing}
      />
      {TOOL_DIMENSIONS.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 px-4 pb-2 lg:px-6">
          {TOOL_DIMENSIONS.map((d) => (
            <Input
              key={d.key}
              value={dimensions[d.key] ?? ''}
              onChange={(e) => onDimensionChange(d.key, e.target.value)}
              placeholder={`${d.label} id…`}
              className="h-8 w-44"
            />
          ))}
        </div>
      )}
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
                  <TableCell colSpan={toolColumns.length} className="h-48">
                    <div className="flex h-full items-center justify-center text-muted-foreground">
                      {isLoading ? (
                        <Spinner size="md" className="text-muted-foreground" />
                      ) : (
                        <div>No tools in this window.</div>
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
