import { Cancel01Icon, Search01Icon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import type { Table } from '@tanstack/react-table'
import { Button } from '#/components/ui/button'
import { Input } from '#/components/ui/input'
import { DataTableFacetedFilter } from './data-table-faceted-filter'
import { DataTableViewOptions } from './data-table-view-options'

export type ToolbarSlot<TData> = (ctx: { table: Table<TData> }) => React.ReactNode

interface DataTableToolbarProps<TData> {
  table: Table<TData>
  searchColumnId?: string
  searchPlaceholder?: string
  facets?: Array<{
    columnId: string
    title: string
    options: { label: string; value: string }[]
  }>
  slot?: ToolbarSlot<TData>
}

export function DataTableToolbar<TData>({
  table,
  searchColumnId,
  searchPlaceholder = 'Search…',
  facets,
  slot,
}: DataTableToolbarProps<TData>) {
  const isFiltered = table.getState().columnFilters.length > 0
  const searchColumn = searchColumnId ? table.getColumn(searchColumnId) : undefined

  return (
    <div className="flex flex-wrap items-center justify-between gap-2">
      <div className="flex flex-1 flex-wrap items-center gap-2">
        {searchColumn && (
          <div className="relative w-full min-w-0 sm:w-64">
            <HugeiconsIcon
              icon={Search01Icon}
              className="pointer-events-none absolute top-1/2 left-2 size-3.5 -translate-y-1/2 text-muted-foreground"
            />
            <Input
              placeholder={searchPlaceholder}
              value={(searchColumn.getFilterValue() as string) ?? ''}
              onChange={(event) => searchColumn.setFilterValue(event.target.value)}
              className="h-7 w-full pl-7"
            />
          </div>
        )}
        {facets?.map((facet) => {
          const column = table.getColumn(facet.columnId)
          if (!column) return null
          return (
            <DataTableFacetedFilter key={facet.columnId} column={column} title={facet.title} options={facet.options} />
          )
        })}
        {isFiltered && (
          <Button variant="ghost" size="sm" onClick={() => table.resetColumnFilters()}>
            Reset
            <HugeiconsIcon icon={Cancel01Icon} />
          </Button>
        )}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {slot?.({ table })}
        <DataTableViewOptions table={table} />
      </div>
    </div>
  )
}
