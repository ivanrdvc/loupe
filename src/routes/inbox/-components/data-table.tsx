import { IconChevronLeft, IconChevronRight, IconSearch } from '@tabler/icons-react'
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
} from '@tanstack/react-table'
import * as React from 'react'
import { DataTableFacetedFilter } from '#/components/data-table-faceted-filter'
import { Spinner } from '#/components/spinner'
import { Button } from '#/components/ui/button'
import { Input } from '#/components/ui/input'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '#/components/ui/table'
import type { InboxRow } from '#/server/inbox'
import { buildInboxColumns, type InboxRowActions } from './columns'

const KIND_OPTIONS = [
  { label: 'New tool', value: 'new_tool' },
  { label: 'New agent', value: 'new_agent' },
]

interface InboxDataTableProps extends InboxRowActions {
  data: InboxRow[]
  isLoading?: boolean
}

export function InboxDataTable({ data, isLoading, ...actions }: InboxDataTableProps) {
  // biome-ignore lint/correctness/useExhaustiveDependencies: actions object identity is fine here; column defs only need callback refs
  const columns = React.useMemo(() => buildInboxColumns(actions), [actions])
  const [columnFilters, setColumnFilters] = React.useState<ColumnFiltersState>([])
  const [sorting, setSorting] = React.useState<SortingState>([{ id: 'firedAtMs', desc: true }])
  const [pagination, setPagination] = React.useState({ pageIndex: 0, pageSize: 25 })

  const table = useReactTable({
    data,
    columns,
    state: { sorting, columnFilters, pagination },
    getRowId: (row) => String(row.id),
    onSortingChange: setSorting,
    onColumnFiltersChange: setColumnFilters,
    onPaginationChange: setPagination,
    getCoreRowModel: getCoreRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFacetedRowModel: getFacetedRowModel(),
    getFacetedUniqueValues: getFacetedUniqueValues(),
  })

  const searchColumn = table.getColumn('summary')
  const searchValue = (searchColumn?.getFilterValue() as string) ?? ''

  return (
    <div className="flex w-full flex-col">
      <div className="flex flex-wrap items-center justify-between gap-2 px-4 pb-3 lg:px-6">
        <div className="relative w-full min-w-0 sm:w-64">
          <IconSearch className="pointer-events-none absolute top-1/2 left-2 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search alerts…"
            value={searchValue}
            onChange={(e) => searchColumn?.setFilterValue(e.target.value)}
            className="w-full border-border bg-transparent pl-7 dark:bg-input/30"
          />
        </div>
        {table.getColumn('kind') && (
          <DataTableFacetedFilter column={table.getColumn('kind')} title="Kind" options={KIND_OPTIONS} />
        )}
      </div>
      <div className="border-t bg-background">
        <Table>
          <TableHeader className="bg-muted/40 [&_th]:font-normal [&_th]:text-muted-foreground [&_button]:font-normal [&_button]:text-muted-foreground">
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
                  className="h-14 [&>:first-child]:pl-4 [&>:last-child]:pr-4 lg:[&>:first-child]:pl-6 lg:[&>:last-child]:pr-6"
                >
                  {row.getVisibleCells().map((cell) => (
                    <TableCell key={cell.id}>{flexRender(cell.column.columnDef.cell, cell.getContext())}</TableCell>
                  ))}
                </TableRow>
              ))
            ) : (
              <TableRow className="hover:bg-transparent">
                <TableCell colSpan={columns.length} className="h-32 text-center text-muted-foreground">
                  {isLoading ? <Spinner size="md" className="mx-auto" /> : 'Inbox is clear.'}
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
      {table.getPageCount() > 1 && (
        <div className="flex items-center justify-end gap-2 border-t bg-background px-4 py-3 lg:px-6">
          <div className="text-xs text-muted-foreground tabular-nums">
            Page {table.getState().pagination.pageIndex + 1} of {table.getPageCount()}
          </div>
          <Button
            variant="outline"
            size="icon-sm"
            onClick={() => table.previousPage()}
            disabled={!table.getCanPreviousPage()}
          >
            <span className="sr-only">Previous page</span>
            <IconChevronLeft />
          </Button>
          <Button variant="outline" size="icon-sm" onClick={() => table.nextPage()} disabled={!table.getCanNextPage()}>
            <span className="sr-only">Next page</span>
            <IconChevronRight />
          </Button>
        </div>
      )}
    </div>
  )
}
