import { type ColumnDef, flexRender, getCoreRowModel, useReactTable } from '@tanstack/react-table'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '#/components/ui/table'
import { cn } from '#/lib/utils'

declare module '@tanstack/react-table' {
  // per-column styling hooks used by DataGrid
  interface ColumnMeta<TData, TValue> {
    className?: string
    headClassName?: string
  }
}

interface DataGridProps<T> {
  columns: ColumnDef<T, unknown>[]
  data: T[]
  getRowId: (row: T) => string
  onRowClick?: (row: T) => void
}

/**
 * Column-def / flexRender table, styled to match the Traces & Sessions tables:
 * full-bleed, border-t, sticky muted header, h-12 rows — no card or surrounding padding.
 */
export function DataGrid<T>({ columns, data, getRowId, onRowClick }: DataGridProps<T>) {
  const table = useReactTable({
    data,
    columns,
    getRowId,
    getCoreRowModel: getCoreRowModel(),
  })

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
