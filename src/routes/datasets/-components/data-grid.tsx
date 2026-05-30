import {
  type ColumnDef,
  flexRender,
  getCoreRowModel,
  type Table as TanstackTable,
  useReactTable,
} from '@tanstack/react-table'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '#/components/ui/table'
import { cn } from '#/lib/utils'

declare module '@tanstack/react-table' {
  // per-column styling hooks used by DataGrid
  interface ColumnMeta<TData, TValue> {
    className?: string
    headClassName?: string
  }
}

/**
 * Renders a TanStack table with the shared Table primitives, styled to match the
 * Traces & Sessions tables: full-bleed, border-t, sticky muted header, h-12 rows.
 * Takes a table instance so the caller can own filtering/sorting state.
 */
export function DataGridBody<T>({ table, onRowClick }: { table: TanstackTable<T>; onRowClick?: (row: T) => void }) {
  return (
    <div className="flex min-h-0 flex-1 flex-col border-t">
      <div className="min-h-0 flex-1 overflow-auto bg-background">
        <Table>
          <TableHeader className="sticky top-0 z-10 bg-muted/40 [&_button]:font-normal [&_button]:text-muted-foreground [&_th]:font-normal [&_th]:text-muted-foreground">
            {table.getHeaderGroups().map((hg) => (
              <TableRow
                key={hg.id}
                className="[&>:first-child]:pl-4 [&>:last-child]:pr-4 lg:[&>:first-child]:pl-6 lg:[&>:last-child]:pr-6"
              >
                {hg.headers.map((header) => (
                  <TableHead
                    key={header.id}
                    colSpan={header.colSpan}
                    className={header.column.columnDef.meta?.headClassName}
                  >
                    {header.isPlaceholder ? null : flexRender(header.column.columnDef.header, header.getContext())}
                  </TableHead>
                ))}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {table.getRowModel().rows.map((row) => (
              <TableRow
                key={row.id}
                className={cn(
                  'h-12 [&>:first-child]:pl-4 [&>:last-child]:pr-4 lg:[&>:first-child]:pl-6 lg:[&>:last-child]:pr-6',
                  onRowClick && 'cursor-pointer',
                )}
                onClick={onRowClick ? () => onRowClick(row.original) : undefined}
              >
                {row.getVisibleCells().map((cell) => (
                  <TableCell key={cell.id} className={cell.column.columnDef.meta?.className}>
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                  </TableCell>
                ))}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  )
}

/** Convenience wrapper for tables that don't need external state (just columns + data). */
export function DataGrid<T>({
  columns,
  data,
  getRowId,
  onRowClick,
}: {
  columns: ColumnDef<T, unknown>[]
  data: T[]
  getRowId: (row: T) => string
  onRowClick?: (row: T) => void
}) {
  const table = useReactTable({ data, columns, getRowId, getCoreRowModel: getCoreRowModel() })
  return <DataGridBody table={table} onRowClick={onRowClick} />
}
