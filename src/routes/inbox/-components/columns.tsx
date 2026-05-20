import { ArrowTopRightOnSquareIcon } from '@heroicons/react/20/solid'
import { Link } from '@tanstack/react-router'
import type { ColumnDef } from '@tanstack/react-table'
import { DataTableColumnHeader } from '#/components/data-table-column-header'
import { Button } from '#/components/ui/button'
import { formatAgo } from '#/lib/format'
import type { InboxRow } from '#/server/inbox'

export interface InboxRowActions {
  onSnooze: (id: number) => void
  onDismiss: (id: number) => void
  snoozePending?: boolean
  dismissPending?: boolean
}

export function buildInboxColumns(actions: InboxRowActions): ColumnDef<InboxRow>[] {
  return [
    {
      accessorKey: 'firedAtMs',
      header: ({ column }) => <DataTableColumnHeader column={column} title="Fired" />,
      cell: ({ row }) => (
        <time
          dateTime={new Date(row.original.firedAtMs).toISOString()}
          title={new Date(row.original.firedAtMs).toLocaleString()}
          className="whitespace-nowrap tabular-nums text-muted-foreground"
        >
          {formatAgo(row.original.firedAtMs)}
        </time>
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
        return [s.summary, s.kind, s.sessionId ?? '', s.traceId ?? ''].join(' ').toLowerCase().includes(q)
      },
    },
    {
      accessorKey: 'kind',
      header: ({ column }) => <DataTableColumnHeader column={column} title="Kind" />,
      cell: ({ row }) => <span className="font-mono text-xs text-muted-foreground">{row.original.kind}</span>,
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
          <Button
            variant="ghost"
            size="sm"
            onClick={() => actions.onSnooze(row.original.id)}
            disabled={actions.snoozePending}
          >
            Snooze
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => actions.onDismiss(row.original.id)}
            disabled={actions.dismissPending}
          >
            Dismiss
          </Button>
        </div>
      ),
    },
  ]
}

function OpenLink({ item }: { item: Pick<InboxRow, 'sessionId' | 'traceId'> }) {
  const linkClass = 'inline-flex items-center text-muted-foreground hover:text-foreground'
  if (item.sessionId) {
    return (
      <Link
        to="/sessions/$sessionId"
        params={{ sessionId: item.sessionId }}
        search={{ range: 1, view: 'conversation' }}
        className={linkClass}
        aria-label="Open session"
      >
        <ArrowTopRightOnSquareIcon className="size-3.5" />
      </Link>
    )
  }
  if (item.traceId) {
    return (
      <Link to="/traces/$traceId" params={{ traceId: item.traceId }} className={linkClass} aria-label="Open trace">
        <ArrowTopRightOnSquareIcon className="size-3.5" />
      </Link>
    )
  }
  return (
    <Link to="/sessions" className={linkClass} aria-label="Open sessions">
      <ArrowTopRightOnSquareIcon className="size-3.5" />
    </Link>
  )
}
