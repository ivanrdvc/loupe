import type { ColumnDef } from '@tanstack/react-table'
import { DataTableColumnHeader } from '#/components/data-table-column-header'
import { RelativeTime } from '#/components/relative-time'
import { Badge } from '#/components/ui/badge'
import { Tokens } from '#/features/inspect'
import { formatDuration, formatPercent } from '#/lib/format'
import type { ToolRow } from '#/lib/telemetry'

export const toolColumns: ColumnDef<ToolRow>[] = [
  {
    accessorKey: 'name',
    header: ({ column }) => <DataTableColumnHeader column={column} title="Tool" />,
    cell: ({ row }) => <span className="font-medium">{row.original.name}</span>,
  },
  {
    accessorKey: 'calls',
    header: ({ column }) => <DataTableColumnHeader column={column} title="Calls" className="justify-end" />,
    cell: ({ row }) => <div className="text-right tabular-nums">{row.original.calls.toLocaleString('en-US')}</div>,
  },
  {
    accessorKey: 'errorRate',
    header: ({ column }) => <DataTableColumnHeader column={column} title="Error rate" className="justify-end" />,
    cell: ({ row }) => {
      const r = row.original
      return (
        <div className="text-right">
          {r.errors > 0 ? (
            <Badge variant="destructive" className="px-1 text-[10px]">
              {formatPercent(r.errorRate, 1)}
            </Badge>
          ) : (
            <span className="text-muted-foreground">—</span>
          )}
        </div>
      )
    },
  },
  {
    accessorKey: 'p95Ms',
    header: ({ column }) => <DataTableColumnHeader column={column} title="p95 latency" className="justify-end" />,
    cell: ({ row }) => <div className="text-right tabular-nums">{formatDuration(row.original.p95Ms)}</div>,
  },
  {
    accessorKey: 'avgTokens',
    header: ({ column }) => <DataTableColumnHeader column={column} title="Avg tokens" className="justify-end" />,
    cell: ({ row }) => (
      <div className="text-right tabular-nums">
        <Tokens tokens={row.original.avgTokens} />
      </div>
    ),
  },
  {
    accessorKey: 'p95Tokens',
    header: ({ column }) => <DataTableColumnHeader column={column} title="p95 tokens" className="justify-end" />,
    cell: ({ row }) => (
      <div className="text-right tabular-nums">
        <Tokens tokens={row.original.p95Tokens} severity />
      </div>
    ),
  },
  {
    accessorKey: 'maxTokens',
    header: ({ column }) => <DataTableColumnHeader column={column} title="Max tokens" className="justify-end" />,
    cell: ({ row }) => (
      <div className="text-right tabular-nums">
        <Tokens tokens={row.original.maxTokens} severity />
      </div>
    ),
  },
  {
    accessorKey: 'totalTokens',
    header: ({ column }) => <DataTableColumnHeader column={column} title="Total tokens" className="justify-end" />,
    cell: ({ row }) => (
      <div className="text-right tabular-nums">
        <Tokens tokens={row.original.totalTokens} />
      </div>
    ),
  },
  {
    accessorKey: 'lastSeenMs',
    header: ({ column }) => <DataTableColumnHeader column={column} title="Last seen" />,
    cell: ({ row }) => (
      <RelativeTime ts={row.original.lastSeenMs} className="whitespace-nowrap tabular-nums text-muted-foreground" />
    ),
  },
]
