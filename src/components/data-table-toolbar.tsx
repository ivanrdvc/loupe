import { IconAdjustmentsHorizontal, IconSearch } from '@tabler/icons-react'
import type { Column, Table } from '@tanstack/react-table'
import { type AutoRefreshInterval, AutoRefreshSelect } from '#/components/auto-refresh-select'
import { DataTableFacetedFilter } from '#/components/data-table-faceted-filter'
import { TimeRangeSelect } from '#/components/time-range-select'
import { Button } from '#/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from '#/components/ui/dropdown-menu'
import { Input } from '#/components/ui/input'
import type { TimeRange } from '#/lib/time-range'

export interface FacetedFilterSpec {
  columnId: string
  title: string
  options: { label: string; value: string; icon?: React.ComponentType<{ className?: string }> }[]
}

interface DataTableToolbarProps<TData> {
  table: Table<TData>
  searchColumnId?: string
  searchPlaceholder?: string
  filters?: FacetedFilterSpec[]
  range: TimeRange
  onRangeChange: (range: TimeRange) => void
  autoRefresh: AutoRefreshInterval
  onAutoRefreshChange: (interval: AutoRefreshInterval) => void
  onRefresh: () => void
  refreshing?: boolean
  actions?: React.ReactNode
}

export function DataTableToolbar<TData>({
  table,
  searchColumnId,
  searchPlaceholder = 'Search…',
  filters,
  range,
  onRangeChange,
  autoRefresh,
  onAutoRefreshChange,
  onRefresh,
  refreshing,
  actions,
}: DataTableToolbarProps<TData>) {
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
            <IconSearch className="pointer-events-none absolute top-1/2 left-2 size-3.5 -translate-y-1/2 text-muted-foreground" />
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
        <TimeRangeSelect value={range} onChange={onRangeChange} />
        <AutoRefreshSelect
          value={autoRefresh}
          onChange={onAutoRefreshChange}
          onRefresh={onRefresh}
          loading={refreshing}
        />
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" className="gap-x-1.5">
              <IconAdjustmentsHorizontal className="size-4" />
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
