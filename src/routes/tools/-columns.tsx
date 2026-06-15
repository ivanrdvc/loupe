import { Link } from '@tanstack/react-router'
import type { ColumnDef } from '@tanstack/react-table'
import { DataTableColumnHeader } from '#/components/data-table-column-header'
import { RelativeTime } from '#/components/relative-time'
import { Badge } from '#/components/ui/badge'
import { TokensFromChars } from '#/features/inspect'
import { formatDuration, formatPercent } from '#/lib/format'
import type { ToolCatalogRow } from '#/lib/telemetry'

export const toolColumns: ColumnDef<ToolCatalogRow>[] = [
  {
    accessorKey: 'name',
    header: ({ column }) => <DataTableColumnHeader column={column} title="Tool" />,
    cell: ({ row }) => (
      <Link from="/tools/" to="." search={(prev) => ({ ...prev, tool: row.original.name })} className="font-medium">
        {row.original.name}
      </Link>
    ),
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
    accessorKey: 'p50Ms',
    header: ({ column }) => <DataTableColumnHeader column={column} title="p50" className="justify-end" />,
    cell: ({ row }) => <div className="text-right tabular-nums">{formatDuration(row.original.p50Ms)}</div>,
  },
  {
    accessorKey: 'p95Ms',
    header: ({ column }) => <DataTableColumnHeader column={column} title="p95" className="justify-end" />,
    cell: ({ row }) => <div className="text-right tabular-nums">{formatDuration(row.original.p95Ms)}</div>,
  },
  {
    accessorKey: 'avgChars',
    header: ({ column }) => <DataTableColumnHeader column={column} title="Avg tokens" className="justify-end" />,
    cell: ({ row }) => (
      <div className="text-right tabular-nums">
        <TokensFromChars chars={row.original.avgChars} />
      </div>
    ),
  },
  {
    accessorKey: 'p95Chars',
    header: ({ column }) => <DataTableColumnHeader column={column} title="p95 tokens" className="justify-end" />,
    cell: ({ row }) => (
      <div className="text-right tabular-nums">
        <TokensFromChars chars={row.original.p95Chars} />
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
