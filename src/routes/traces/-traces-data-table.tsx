import { Loading03Icon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import {
  IconAdjustmentsHorizontal,
  IconChevronLeft,
  IconChevronRight,
  IconChevronsLeft,
  IconChevronsRight,
  IconSearch,
} from '@tabler/icons-react'
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
import { type AutoRefreshInterval, AutoRefreshSelect } from '#/components/auto-refresh-select'
import { DataTableFacetedFilter } from '#/components/data-table-faceted-filter'
import { RefreshingIndicator } from '#/components/refreshing-indicator'
import { TimeRangeSelect } from '#/components/time-range-select'
import { Button } from '#/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from '#/components/ui/dropdown-menu'
import { Input } from '#/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '#/components/ui/select'
import { Separator } from '#/components/ui/separator'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '#/components/ui/table'
import { Tooltip, TooltipContent, TooltipTrigger } from '#/components/ui/tooltip'
import { useScopeToMe, useUserId } from '#/hooks/use-user'
import type { TraceSummary } from '#/lib/telemetry'
import type { TimeRange } from '#/lib/time-range'
import { cn } from '#/lib/utils'
import { traceColumns } from './-columns'

const STATUS_OPTIONS = [
  { label: 'OK', value: 'ok' },
  { label: 'Error', value: 'error' },
]

const CATEGORY_OPTIONS = [
  { label: 'Chat', value: 'chat' },
  { label: 'Sub-agent', value: 'sub-agent' },
  { label: 'Scheduled', value: 'scheduled' },
  { label: 'Webhook', value: 'webhook' },
  { label: 'Background', value: 'background' },
  { label: 'Utility', value: 'utility' },
  { label: 'Orphan', value: 'orphan' },
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
}: TracesDataTableProps) {
  const [userId] = useUserId()
  const [scopeToMe] = useScopeToMe()
  const [columnVisibility, setColumnVisibility] = React.useState<VisibilityState>({
    status: false,
    category: false,
    hasSession: false,
  })
  const [columnFilters, setColumnFilters] = React.useState<ColumnFiltersState>([
    { id: 'category', value: ['chat', 'sub-agent', 'scheduled', 'webhook', 'background', 'utility', 'orphan'] },
    { id: 'hasSession', value: ['no'] },
  ])
  const [sorting, setSorting] = React.useState<SortingState>([])
  const [pagination, setPagination] = React.useState({
    pageIndex: 0,
    pageSize: 50,
  })

  const table = useReactTable({
    data,
    columns: traceColumns,
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

  const searchColumn = table.getColumn('id')
  const searchValue = (searchColumn?.getFilterValue() as string) ?? ''

  return (
    <div className="flex h-full w-full flex-col">
      <div className="-mt-4 flex flex-wrap items-center justify-between gap-x-3 gap-y-2 border-b bg-muted/30 px-4 py-2 md:-mt-6 lg:px-6">
        <div className="flex flex-1 flex-wrap items-center gap-2">
          {searchColumn && (
            <div className="relative w-full min-w-0 sm:w-64">
              <IconSearch className="pointer-events-none absolute top-1/2 left-2 size-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Search traces, agents, users…"
                value={searchValue}
                onChange={(e) => searchColumn.setFilterValue(e.target.value)}
                className="h-8 w-full border-border bg-transparent pl-7 dark:bg-input/30"
              />
            </div>
          )}
          <RefreshingIndicator active={!!refreshing} />
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          {(() => {
            const col = table.getColumn('hasSession')
            if (!col) return null
            const current = col.getFilterValue() as string[] | undefined
            const showingSession = !current || current.length === 0 || current.includes('yes')
            return (
              <Button
                variant={showingSession ? 'secondary' : 'outline'}
                size="sm"
                onClick={() => col.setFilterValue(showingSession ? ['no'] : ['yes', 'no'])}
              >
                {showingSession ? 'Showing session traces' : 'Session traces hidden'}
              </Button>
            )
          })()}
          {table.getColumn('category') && (
            <DataTableFacetedFilter column={table.getColumn('category')} title="Category" options={CATEGORY_OPTIONS} />
          )}
          {table.getColumn('status') && (
            <DataTableFacetedFilter column={table.getColumn('status')} title="Status" options={STATUS_OPTIONS} />
          )}
          <TimeRangeSelect value={range} onChange={onRangeChange} />
          <AutoRefreshSelect
            value={autoRefresh}
            onChange={onAutoRefreshChange}
            onRefresh={onRefresh}
            loading={refreshing}
          />
          <Separator orientation="vertical" className="mx-1 h-5 self-center" />
          <DropdownMenu>
            <Tooltip>
              <TooltipTrigger asChild>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon-sm" aria-label="Customize columns">
                    <IconAdjustmentsHorizontal />
                  </Button>
                </DropdownMenuTrigger>
              </TooltipTrigger>
              <TooltipContent>Customize columns</TooltipContent>
            </Tooltip>
            <DropdownMenuContent align="end" className="w-56">
              {table
                .getAllColumns()
                .filter((column) => typeof column.accessorFn !== 'undefined' && column.getCanHide())
                .map((column) => (
                  <DropdownMenuCheckboxItem
                    key={column.id}
                    className="capitalize"
                    checked={column.getIsVisible()}
                    onCheckedChange={(value) => column.toggleVisibility(!!value)}
                  >
                    {column.id}
                  </DropdownMenuCheckboxItem>
                ))}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
      <div className="flex min-h-0 flex-1 flex-col px-4 py-4 md:py-6 lg:px-6">
        <div className="min-h-0 flex-1 overflow-auto rounded-lg border">
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
                    className={cn('h-12', onRowClick && 'cursor-pointer')}
                    onClick={onRowClick ? () => onRowClick(row.original) : undefined}
                  >
                    {row.getVisibleCells().map((cell) => (
                      <TableCell key={cell.id}>{flexRender(cell.column.columnDef.cell, cell.getContext())}</TableCell>
                    ))}
                  </TableRow>
                ))
              ) : (
                <TableRow className="hover:bg-transparent">
                  <TableCell colSpan={traceColumns.length} className="h-48">
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
                            No traces for <span className="font-mono text-foreground">{userId}</span>.
                          </div>
                          <div className="text-xs">Turn off scope-to-me in Settings → Account to see all traces.</div>
                        </div>
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
