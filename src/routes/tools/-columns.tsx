import type { ColumnDef } from '@tanstack/react-table'
import { DataTableColumnHeader } from '#/components/data-table-column-header'
import { RelativeTime } from '#/components/relative-time'
import { Badge } from '#/components/ui/badge'
import { Tokens } from '#/features/inspect'
import { signalFacets, ToolFacetBadges, type ToolSignal } from '#/features/mcp'
import { formatDuration, formatPercent } from '#/lib/format'
import type { ToolRow } from '#/lib/telemetry'
import { ACCENT } from '#/lib/tone'

export function toolColumns(signalsByName: Record<string, ToolSignal[]>): ColumnDef<ToolRow>[] {
  return [
    {
      accessorKey: 'name',
      header: ({ column }) => <DataTableColumnHeader column={column} title="Tool" />,
      cell: ({ row }) => (
        <span className={`font-mono text-xs font-medium ${ACCENT.violet.ident}`}>{row.original.name}</span>
      ),
    },
    {
      id: 'facets',
      header: ({ column }) => <DataTableColumnHeader column={column} title="Facets" />,
      enableSorting: false,
      cell: ({ row }) => <ToolFacetBadges facets={signalFacets(signalsByName[row.original.name] ?? [])} size="sm" />,
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
      accessorKey: 'avgTokensEst',
      header: ({ column }) => <DataTableColumnHeader column={column} title="Avg tokens" className="justify-end" />,
      cell: ({ row }) => (
        <div className="text-right tabular-nums">
          <Tokens tokens={row.original.avgTokensEst} estimate />
        </div>
      ),
    },
    {
      accessorKey: 'p95TokensEst',
      header: ({ column }) => <DataTableColumnHeader column={column} title="p95 tokens" className="justify-end" />,
      cell: ({ row }) => (
        <div className="text-right tabular-nums">
          <Tokens tokens={row.original.p95TokensEst} severity estimate />
        </div>
      ),
    },
    {
      accessorKey: 'maxTokens',
      header: ({ column }) => <DataTableColumnHeader column={column} title="Max tokens" className="justify-end" />,
      cell: ({ row }) => (
        <div className="text-right tabular-nums">
          <Tokens tokens={row.original.maxTokens} severity estimate={row.original.maxTokensEst} />
        </div>
      ),
    },
    {
      accessorKey: 'totalTokensEst',
      header: ({ column }) => <DataTableColumnHeader column={column} title="Total tokens" className="justify-end" />,
      cell: ({ row }) => (
        <div className="text-right tabular-nums">
          <Tokens tokens={row.original.totalTokensEst} estimate />
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
}
