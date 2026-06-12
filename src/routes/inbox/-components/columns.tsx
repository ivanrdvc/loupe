import { Link } from '@tanstack/react-router'
import type { ColumnDef } from '@tanstack/react-table'
import { ArrowUpRight } from 'lucide-react'
import { DataTableColumnHeader } from '#/components/data-table-column-header'
import { RelativeTime } from '#/components/relative-time'
import { Button } from '#/components/ui/button'
import type { InboxRow } from '#/features/inbox/server'
import { ALERT_KINDS } from '#/lib/alerts/kinds'
import { inboxItemTraceLink } from '../-meta'

export interface InboxRowActions {
  onSnooze: (id: number) => void
  onDismiss: (id: number) => void
}

export function buildInboxColumns(actions: InboxRowActions): ColumnDef<InboxRow>[] {
  return [
    {
      accessorKey: 'firedAtMs',
      header: ({ column }) => <DataTableColumnHeader column={column} title="Fired" />,
      cell: ({ row }) => (
        <RelativeTime ts={row.original.firedAtMs} className="whitespace-nowrap tabular-nums text-muted-foreground" />
      ),
    },
    {
      accessorKey: 'summary',
      header: ({ column }) => <DataTableColumnHeader column={column} title="Alert" />,
      cell: ({ row }) => <span className="font-medium text-foreground">{row.original.summary}</span>,
      filterFn: (row, _id, value) => {
        const q = String(value ?? '')
          .trim()
          .toLowerCase()
        if (!q) return true
        const s = row.original
        return [s.summary, s.kind, s.traceId ?? ''].join(' ').toLowerCase().includes(q)
      },
    },
    {
      accessorKey: 'kind',
      header: ({ column }) => <DataTableColumnHeader column={column} title="Kind" />,
      cell: ({ row }) => (
        <span className="text-xs text-muted-foreground">
          {ALERT_KINDS[row.original.kind]?.label ?? row.original.kind}
        </span>
      ),
      filterFn: (row, _id, value: string[]) => Array.isArray(value) && value.includes(row.original.kind),
    },
    {
      id: 'open',
      header: () => null,
      enableSorting: false,
      enableHiding: false,
      cell: ({ row }) => <OpenLink item={row.original} />,
    },
    {
      id: 'actions',
      header: () => null,
      enableSorting: false,
      enableHiding: false,
      cell: ({ row }) => (
        <div className="flex justify-end gap-2">
          <Button variant="ghost" size="sm" onClick={() => actions.onSnooze(row.original.id)}>
            Snooze
          </Button>
          <Button variant="ghost" size="sm" onClick={() => actions.onDismiss(row.original.id)}>
            Dismiss
          </Button>
        </div>
      ),
    },
  ]
}

function OpenLink({ item }: { item: Pick<InboxRow, 'traceId'> }) {
  const link = inboxItemTraceLink(item)
  if (!link) return null
  return (
    <Link
      {...link}
      className="inline-flex items-center text-muted-foreground hover:text-foreground"
      aria-label="Open trace"
    >
      <ArrowUpRight className="size-3.5" aria-hidden />
    </Link>
  )
}
