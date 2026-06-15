import type { Column, Table } from '@tanstack/react-table'
import { RefreshCw, Search, SlidersHorizontal } from 'lucide-react'
import type { ReactNode } from 'react'
import { DataTableFacetedFilter } from '#/components/data-table-faceted-filter'
import type { FacetedFilterSpec } from '#/components/data-table-toolbar'
import { Button } from '#/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from '#/components/ui/dropdown-menu'
import { Input } from '#/components/ui/input'
import { cn } from '#/lib/utils'

// Like DataTableToolbar, minus the time-range / auto-refresh controls — MCP
// registry data is point-in-time, not windowed.
interface McpTableToolbarProps<TData> {
  table: Table<TData>
  searchColumnId?: string
  searchPlaceholder?: string
  filters?: FacetedFilterSpec[]
  onRefresh?: () => void
  refreshing?: boolean
  actions?: ReactNode
}

export function McpTableToolbar<TData>({
  table,
  searchColumnId,
  searchPlaceholder = 'Search…',
  filters,
  onRefresh,
  refreshing,
  actions,
}: McpTableToolbarProps<TData>) {
  const searchColumn = searchColumnId ? table.getColumn(searchColumnId) : undefined
  const searchValue = (searchColumn?.getFilterValue() as string) ?? ''
  const isFiltered = table.getState().columnFilters.length > 0

  return (
    <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 px-4 py-4 lg:px-6">
      <div className="flex flex-1 flex-wrap items-center gap-2">
        {filters?.map((f) => {
          const column = table.getColumn(f.columnId) as Column<TData, unknown> | undefined
          if (!column) return null
          return <DataTableFacetedFilter key={f.columnId} column={column} title={f.title} options={f.options} />
        })}
        {searchColumn && (
          <div className="relative w-full min-w-0 sm:w-64">
            <Search
              className="pointer-events-none absolute top-1/2 left-2 size-3.5 -translate-y-1/2 text-muted-foreground"
              aria-hidden
            />
            <Input
              placeholder={searchPlaceholder}
              value={searchValue}
              onChange={(e) => searchColumn.setFilterValue(e.target.value)}
              className="h-8 w-full border-border bg-transparent pl-7 dark:bg-input/30"
            />
          </div>
        )}
        {isFiltered && (
          <Button
            variant="ghost"
            onClick={() => table.resetColumnFilters()}
            className="text-primary hover:text-primary"
          >
            Clear filters
          </Button>
        )}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {actions}
        {onRefresh && (
          <Button variant="outline" onClick={onRefresh} disabled={refreshing} className="gap-x-1.5">
            <RefreshCw className={cn('size-4', refreshing && 'animate-spin')} aria-hidden />
            Refresh
          </Button>
        )}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" className="gap-x-1.5">
              <SlidersHorizontal className="size-4" aria-hidden />
              View
            </Button>
          </DropdownMenuTrigger>
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
  )
}
