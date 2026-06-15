import { Link } from '@tanstack/react-router'
import type { ColumnDef } from '@tanstack/react-table'
import { DataTableColumnHeader } from '#/components/data-table-column-header'
import { Badge } from '#/components/ui/badge'
import { findingsForServer, type McpLintFinding, type McpServer } from '#/features/mcp'
import { FindingsBadge, StatusBadge } from './-mcp-badges'

export function serverColumns(findings: McpLintFinding[]): ColumnDef<McpServer>[] {
  return [
    {
      accessorKey: 'name',
      header: ({ column }) => <DataTableColumnHeader column={column} title="Server" />,
      cell: ({ row }) => (
        <Link to="/mcp/$serverId" params={{ serverId: row.original.id }} className="flex min-w-0 flex-col">
          <span className="font-medium">{row.original.name}</span>
          <span className="truncate font-mono text-xs text-muted-foreground">
            {row.original.endpoint ?? row.original.source}
          </span>
        </Link>
      ),
    },
    {
      id: 'owner',
      accessorFn: (s) => s.ownerTeam ?? s.ownerContact ?? '',
      header: ({ column }) => <DataTableColumnHeader column={column} title="Owner" />,
      cell: ({ row }) => {
        const owner = row.original.ownerTeam ?? row.original.ownerContact
        return owner ? <span>{owner}</span> : <span className="text-muted-foreground">unowned</span>
      },
    },
    {
      accessorKey: 'transport',
      header: ({ column }) => <DataTableColumnHeader column={column} title="Transport" />,
      cell: ({ row }) => <Badge variant="outline">{row.original.transport}</Badge>,
      filterFn: (row, _id, value: string[]) => value.includes(row.original.transport),
    },
    {
      id: 'tools',
      accessorFn: (s) => s.tools.length,
      header: ({ column }) => <DataTableColumnHeader column={column} title="Tools" className="justify-end" />,
      cell: ({ row }) => <div className="text-right tabular-nums">{row.original.tools.length}</div>,
    },
    {
      id: 'findings',
      header: () => <div className="text-right">Findings</div>,
      cell: ({ row }) => (
        <div className="flex justify-end">
          <FindingsBadge findings={findingsForServer(findings, row.original.id)} />
        </div>
      ),
      enableSorting: false,
    },
    {
      accessorKey: 'fetchStatus',
      header: ({ column }) => <DataTableColumnHeader column={column} title="Status" />,
      cell: ({ row }) => <StatusBadge status={row.original.fetchStatus} />,
      filterFn: (row, _id, value: string[]) => value.includes(row.original.fetchStatus),
    },
  ]
}
