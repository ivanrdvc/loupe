import { Link } from '@tanstack/react-router'
import type { ColumnDef } from '@tanstack/react-table'
import { DataTableColumnHeader } from '#/components/data-table-column-header'
import { Badge } from '#/components/ui/badge'
import {
  aggregateTools,
  GROUP_ORDER,
  type McpServer,
  TOOL_TAGS,
  type ToolFacet,
  ToolFacetBadges,
  toolFacets,
} from '#/features/mcp'
import { ACCENT } from '#/lib/tone'

export interface ToolTableRow {
  name: string
  providers: { serverId: string; serverName: string }[]
  duplicate: boolean
  conflict: boolean
  facets: ToolFacet[]
  facetIds: string[]
}

export function buildToolRows(servers: McpServer[]): ToolTableRow[] {
  return aggregateTools(servers).map((u) => {
    // Union facets across providers — a duplicate may be richer on one server.
    const byId = new Map<string, ToolFacet>()
    for (const p of u.providers) for (const f of toolFacets(p.tool, TOOL_TAGS[p.tool.id] ?? [])) byId.set(f.id, f)
    const facets = [...byId.values()].sort((a, b) => GROUP_ORDER[a.group] - GROUP_ORDER[b.group])
    return {
      name: u.name,
      providers: u.providers.map((p) => ({ serverId: p.serverId, serverName: p.serverName })),
      duplicate: u.duplicate,
      conflict: u.conflict,
      facets,
      facetIds: facets.map((f) => f.id),
    }
  })
}

export const toolColumns: ColumnDef<ToolTableRow>[] = [
  {
    accessorKey: 'name',
    header: ({ column }) => <DataTableColumnHeader column={column} title="Tool" />,
    cell: ({ row }) => (
      <span className="flex items-center gap-2">
        <span className={`font-mono text-xs font-medium ${ACCENT.violet.ident}`}>{row.original.name}</span>
        {row.original.conflict ? (
          <Badge variant="destructive">conflict</Badge>
        ) : row.original.duplicate ? (
          <Badge variant="warning">dup</Badge>
        ) : null}
      </span>
    ),
  },
  {
    id: 'servers',
    header: ({ column }) => <DataTableColumnHeader column={column} title="Server" />,
    enableSorting: false,
    cell: ({ row }) => (
      <span className="flex flex-wrap gap-1">
        {row.original.providers.map((p) => (
          <Link key={p.serverId} to="/mcp/$serverId" params={{ serverId: p.serverId }}>
            <Badge variant="outline" className="font-normal hover:bg-muted">
              {p.serverName}
            </Badge>
          </Link>
        ))}
      </span>
    ),
  },
  {
    id: 'facets',
    accessorFn: (row) => row.facetIds,
    getUniqueValues: (row) => row.facetIds,
    header: ({ column }) => <DataTableColumnHeader column={column} title="Facets" />,
    enableSorting: false,
    filterFn: (row, _id, selected: string[]) => selected.every((s) => row.original.facetIds.includes(s)),
    cell: ({ row }) => <ToolFacetBadges facets={row.original.facets} size="sm" />,
  },
]
