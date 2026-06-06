import type { ColumnDef } from '@tanstack/react-table'
import { DataTableColumnHeader } from '#/components/data-table-column-header'
import { RelativeTime } from '#/components/relative-time'
import { ToolLink } from '#/components/tool-link'
import { Badge } from '#/components/ui/badge'
import { formatDuration, formatPercent, formatTokens, tokensFromChars } from '#/lib/format'
import type { ToolCatalogRow } from '#/lib/telemetry'

function Tokens({ chars }: { chars: number }) {
  if (!chars) return <span className="text-muted-foreground">—</span>
  const tokens = tokensFromChars(chars)
  return (
    <span title={`${chars.toLocaleString()} chars · ≈${tokens.toLocaleString()} tokens`}>
      {formatTokens(tokens)}
      <span className="text-muted-foreground"> tok</span>
    </span>
  )
}

export const toolColumns: ColumnDef<ToolCatalogRow>[] = [
  {
    accessorKey: 'name',
    header: ({ column }) => <DataTableColumnHeader column={column} title="Tool" />,
    cell: ({ row }) => <ToolLink name={row.original.name} className="font-medium" />,
    filterFn: (row, _id, value) => {
      const q = String(value ?? '')
        .trim()
        .toLowerCase()
      if (!q) return true
      return row.original.name.toLowerCase().includes(q)
    },
  },
  {
    accessorKey: 'calls',
    header: ({ column }) => <DataTableColumnHeader column={column} title="Calls" className="justify-end" />,
    cell: ({ row }) => <div className="text-right tabular-nums">{row.original.calls.toLocaleString()}</div>,
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
        <Tokens chars={row.original.avgChars} />
      </div>
    ),
  },
  {
    accessorKey: 'p95Chars',
    header: ({ column }) => <DataTableColumnHeader column={column} title="p95 tokens" className="justify-end" />,
    cell: ({ row }) => (
      <div className="text-right tabular-nums">
        <Tokens chars={row.original.p95Chars} />
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
