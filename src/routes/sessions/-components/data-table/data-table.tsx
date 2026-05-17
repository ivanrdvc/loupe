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
  type Table as TableInstance,
  useReactTable,
  type VisibilityState,
} from '@tanstack/react-table'
import { useEffect, useMemo, useState } from 'react'
import { Skeleton } from '#/components/ui/skeleton'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '#/components/ui/table'
import { cn } from '#/lib/utils'
import { DataTablePagination } from './data-table-pagination'
import { DataTableToolbar, type ToolbarSlot } from './data-table-toolbar'

interface PersistedTableState {
  sorting?: SortingState
  columnFilters?: ColumnFiltersState
  columnVisibility?: VisibilityState
  pageSize?: number
  globalFilter?: string
}

interface DataTableProps<TData, TValue> {
  columns: ColumnDef<TData, TValue>[]
  data: TData[]
  loading?: boolean
  storageKey?: string
  defaultColumnVisibility?: VisibilityState
  toolbarSlot?: ToolbarSlot<TData>
  onRowClick?: (row: TData) => void
  rowClassName?: (row: TData) => string | undefined
  facets?: Array<{
    columnId: string
    title: string
    options: { label: string; value: string }[]
  }>
  searchColumnId?: string
  searchPlaceholder?: string
  emptyState?: React.ReactNode
}

function readPersisted(storageKey: string | undefined): PersistedTableState {
  if (!storageKey || typeof window === 'undefined') return {}
  try {
    const raw = window.localStorage.getItem(storageKey)
    if (!raw) return {}
    return JSON.parse(raw) as PersistedTableState
  } catch {
    return {}
  }
}

function writePersisted(storageKey: string, value: PersistedTableState) {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(storageKey, JSON.stringify(value))
  } catch {
    // ignore quota / privacy mode failures
  }
}

export function DataTable<TData, TValue>({
  columns,
  data,
  loading,
  storageKey,
  defaultColumnVisibility,
  toolbarSlot,
  onRowClick,
  rowClassName,
  facets,
  searchColumnId,
  searchPlaceholder,
  emptyState,
}: DataTableProps<TData, TValue>) {
  const initial = useMemo(() => readPersisted(storageKey), [storageKey])

  const [sorting, setSorting] = useState<SortingState>(initial.sorting ?? [])
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>(initial.columnFilters ?? [])
  const [columnVisibility, setColumnVisibility] = useState<VisibilityState>(
    initial.columnVisibility ?? defaultColumnVisibility ?? {},
  )
  const [rowSelection, setRowSelection] = useState({})
  const [pageSize, setPageSize] = useState(initial.pageSize ?? 25)

  const table = useReactTable({
    data,
    columns,
    state: {
      sorting,
      columnVisibility,
      rowSelection,
      columnFilters,
    },
    initialState: {
      pagination: { pageSize },
    },
    enableRowSelection: true,
    onRowSelectionChange: setRowSelection,
    onSortingChange: setSorting,
    onColumnFiltersChange: setColumnFilters,
    onColumnVisibilityChange: setColumnVisibility,
    getCoreRowModel: getCoreRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFacetedRowModel: getFacetedRowModel(),
    getFacetedUniqueValues: getFacetedUniqueValues(),
  })

  const currentPageSize = table.getState().pagination.pageSize

  useEffect(() => {
    if (!storageKey) return
    writePersisted(storageKey, {
      sorting,
      columnFilters,
      columnVisibility,
      pageSize: currentPageSize,
    })
  }, [storageKey, sorting, columnFilters, columnVisibility, currentPageSize])

  useEffect(() => {
    setPageSize(currentPageSize)
  }, [currentPageSize])

  const rowCount = table.getRowModel().rows.length
  const isFiltered = columnFilters.length > 0

  return (
    <div className="flex h-full min-h-0 flex-col gap-3">
      <DataTableToolbar
        table={table}
        facets={facets}
        searchColumnId={searchColumnId}
        searchPlaceholder={searchPlaceholder}
        slot={toolbarSlot}
      />
      <div className="min-h-0 flex-1 overflow-auto rounded-md border">
        <Table>
          <TableHeader className="sticky top-0 z-10 bg-background">
            {table.getHeaderGroups().map((headerGroup) => (
              <TableRow key={headerGroup.id}>
                {headerGroup.headers.map((header) => (
                  <TableHead key={header.id} colSpan={header.colSpan}>
                    {header.isPlaceholder ? null : flexRender(header.column.columnDef.header, header.getContext())}
                  </TableHead>
                ))}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {loading ? (
              Array.from({ length: 8 }).map((_, i) => (
                // biome-ignore lint/suspicious/noArrayIndexKey: skeleton placeholder rows
                <TableRow key={`skeleton-${i}`}>
                  {table.getVisibleLeafColumns().map((col) => (
                    <TableCell key={col.id}>
                      <Skeleton className="h-4 w-full" />
                    </TableCell>
                  ))}
                </TableRow>
              ))
            ) : rowCount ? (
              table.getRowModel().rows.map((row) => (
                <TableRow
                  key={row.id}
                  data-state={row.getIsSelected() ? 'selected' : undefined}
                  className={cn(onRowClick && 'cursor-pointer', rowClassName?.(row.original))}
                  onClick={onRowClick ? () => onRowClick(row.original) : undefined}
                >
                  {row.getVisibleCells().map((cell) => (
                    <TableCell key={cell.id}>{flexRender(cell.column.columnDef.cell, cell.getContext())}</TableCell>
                  ))}
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell colSpan={columns.length} className="h-32 text-center text-muted-foreground">
                  {emptyState ?? (
                    <span>
                      {isFiltered ? (
                        <>
                          No results match your filters.{' '}
                          <button
                            type="button"
                            className="font-medium text-primary underline-offset-4 hover:underline"
                            onClick={() => table.resetColumnFilters()}
                          >
                            Clear filters
                          </button>
                        </>
                      ) : (
                        'No results.'
                      )}
                    </span>
                  )}
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
      <DataTablePagination table={table} />
    </div>
  )
}

export type { TableInstance }
