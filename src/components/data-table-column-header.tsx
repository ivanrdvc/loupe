import type { Column } from '@tanstack/react-table'
import { ArrowDown, ArrowUp, ChevronsUpDown } from 'lucide-react'
import { Button } from '#/components/ui/button'
import { cn } from '#/lib/utils'

interface DataTableColumnHeaderProps<TData, TValue> extends React.HTMLAttributes<HTMLDivElement> {
  column: Column<TData, TValue>
  title: string
}

export function DataTableColumnHeader<TData, TValue>({
  column,
  title,
  className,
}: DataTableColumnHeaderProps<TData, TValue>) {
  if (!column.getCanSort()) {
    return <div className={cn(className)}>{title}</div>
  }

  const sorted = column.getIsSorted()
  return (
    <div className={cn('flex items-center gap-2', className)}>
      <Button variant="ghost" size="xs" className="-ml-2" onClick={() => column.toggleSorting(sorted !== 'desc')}>
        <span>{title}</span>
        {sorted === 'desc' ? (
          <ArrowDown aria-hidden />
        ) : sorted === 'asc' ? (
          <ArrowUp aria-hidden />
        ) : (
          <ChevronsUpDown aria-hidden />
        )}
      </Button>
    </div>
  )
}
