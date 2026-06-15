import type { ColumnDef } from '@tanstack/react-table'
import { DataTableColumnHeader } from '#/components/data-table-column-header'
import { Badge } from '#/components/ui/badge'
import type { McpLintFinding, McpTool } from '#/features/mcp'
import type { JsonValue } from '#/lib/json'
import { FindingsBadge } from './-mcp-badges'

export function serverToolColumns(serverFindings: McpLintFinding[]): ColumnDef<McpTool>[] {
  return [
    {
      accessorKey: 'name',
      header: ({ column }) => <DataTableColumnHeader column={column} title="Tool" />,
      cell: ({ row }) => <span className="font-medium">{row.original.name}</span>,
    },
    {
      id: 'description',
      accessorFn: (t) => t.description ?? '',
      header: ({ column }) => <DataTableColumnHeader column={column} title="Description" />,
      cell: ({ row }) =>
        row.original.description ? (
          <span className="line-clamp-2 max-w-prose text-muted-foreground">{row.original.description}</span>
        ) : (
          <span className="text-muted-foreground">—</span>
        ),
    },
    {
      id: 'schema',
      header: () => 'Schema',
      cell: ({ row }) => {
        const count = paramCount(row.original.inputSchema)
        return <Badge variant="outline">{count === 0 ? 'no params' : `${count} param${count === 1 ? '' : 's'}`}</Badge>
      },
      enableSorting: false,
    },
    {
      id: 'lint',
      header: () => <div className="text-right">Lint</div>,
      cell: ({ row }) => (
        <div className="flex justify-end">
          <FindingsBadge findings={serverFindings.filter((f) => f.toolName === row.original.name)} />
        </div>
      ),
      enableSorting: false,
    },
  ]
}

function paramCount(schema: JsonValue | undefined): number {
  if (!schema || typeof schema !== 'object' || Array.isArray(schema)) return 0
  const props = (schema as Record<string, JsonValue>).properties
  if (!props || typeof props !== 'object' || Array.isArray(props)) return 0
  return Object.keys(props).length
}
