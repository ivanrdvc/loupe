import { MoreHorizontalIcon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import type { Row } from '@tanstack/react-table'
import { Button } from '#/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '#/components/ui/dropdown-menu'

interface RowAction<TData> {
  label: string
  onSelect: (row: TData) => void
  destructive?: boolean
  separatorBefore?: boolean
}

interface DataTableRowActionsProps<TData> {
  row: Row<TData>
  actions: RowAction<TData>[]
}

export function DataTableRowActions<TData>({ row, actions }: DataTableRowActionsProps<TData>) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon-sm"
          className="data-[state=open]:bg-muted"
          onClick={(event) => event.stopPropagation()}
        >
          <HugeiconsIcon icon={MoreHorizontalIcon} />
          <span className="sr-only">Open menu</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-[180px]" onClick={(event) => event.stopPropagation()}>
        {actions.map((action, idx) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: stable order from caller
          <div key={`${idx}-${action.label}`}>
            {action.separatorBefore && <DropdownMenuSeparator />}
            <DropdownMenuItem
              variant={action.destructive ? 'destructive' : undefined}
              onClick={() => action.onSelect(row.original)}
            >
              {action.label}
            </DropdownMenuItem>
          </div>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

export type { RowAction }
