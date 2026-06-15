import { Link } from '@tanstack/react-router'
import type { ColumnDef } from '@tanstack/react-table'
import { DataTableColumnHeader } from '#/components/data-table-column-header'
import { LINT_CATEGORY_LABELS, type LintSeverity, type McpLintFinding } from '#/features/mcp'
import { SeverityBadge } from './-mcp-badges'

const SEVERITY_RANK: Record<LintSeverity, number> = { error: 0, warning: 1, info: 2 }

export function lintColumns(): ColumnDef<McpLintFinding>[] {
  return [
    {
      accessorKey: 'severity',
      header: ({ column }) => <DataTableColumnHeader column={column} title="Severity" />,
      cell: ({ row }) => <SeverityBadge severity={row.original.severity} />,
      sortingFn: (a, b) => SEVERITY_RANK[a.original.severity] - SEVERITY_RANK[b.original.severity],
      filterFn: (row, _id, value: string[]) => value.includes(row.original.severity),
    },
    {
      id: 'server',
      accessorFn: (f) => f.serverName,
      header: ({ column }) => <DataTableColumnHeader column={column} title="Server" />,
      cell: ({ row }) => (
        <Link to="/mcp/$serverId" params={{ serverId: row.original.serverId }} className="flex min-w-0 flex-col">
          <span className="font-medium hover:underline">{row.original.serverName}</span>
          {row.original.toolName && (
            <span className="truncate font-mono text-xs text-muted-foreground">{row.original.toolName}</span>
          )}
        </Link>
      ),
    },
    {
      accessorKey: 'message',
      header: ({ column }) => <DataTableColumnHeader column={column} title="Finding" />,
      cell: ({ row }) => (
        <div className="max-w-xl py-1">
          <p className="text-sm whitespace-normal">{row.original.message}</p>
          <p className="mt-0.5 font-mono text-xs text-muted-foreground">{row.original.ruleId}</p>
        </div>
      ),
    },
    {
      id: 'category',
      accessorFn: (f) => f.category,
      header: ({ column }) => <DataTableColumnHeader column={column} title="Category" />,
      cell: ({ row }) => (
        <span className="text-sm text-muted-foreground">{LINT_CATEGORY_LABELS[row.original.category]}</span>
      ),
      filterFn: (row, _id, value: string[]) => value.includes(row.original.category),
    },
  ]
}
