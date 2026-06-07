import { LockedIcon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import type { ColumnDef } from '@tanstack/react-table'
import { DataTableColumnHeader } from '#/components/data-table-column-header'
import { RelativeTime } from '#/components/relative-time'
import { Badge } from '#/components/ui/badge'
import { Tooltip, TooltipContent, TooltipTrigger } from '#/components/ui/tooltip'
import type { Prompt, PromptFolder, Tag } from '#/features/inventory/system-prompts/types'
import { TagChip } from './tag-chip'

export type PromptRowMeta = {
  folderById: Map<number, PromptFolder>
  tagsById: Map<number, Tag>
}

export function buildPromptColumns({ folderById, tagsById }: PromptRowMeta): ColumnDef<Prompt>[] {
  return [
    {
      accessorKey: 'kind',
      accessorFn: (p) => (p.folderId != null && folderById.get(p.folderId)?.kind === 'system' ? 'system' : 'user'),
      header: () => null,
      cell: () => null,
      filterFn: (row, _id, value: string[]) => {
        if (!Array.isArray(value) || value.length === 0) return true
        const kind =
          row.original.folderId != null && folderById.get(row.original.folderId)?.kind === 'system' ? 'system' : 'user'
        return value.includes(kind)
      },
      enableSorting: false,
      enableHiding: false,
    },
    {
      accessorKey: 'tagIds',
      accessorFn: (p) => p.tagIds.map(String),
      header: () => null,
      cell: () => null,
      filterFn: (row, _id, value: string[]) => {
        if (!Array.isArray(value) || value.length === 0) return true
        const want = new Set(value)
        return row.original.tagIds.some((id) => want.has(String(id)))
      },
      enableSorting: false,
      enableHiding: false,
    },
    {
      accessorKey: 'name',
      header: ({ column }) => <DataTableColumnHeader column={column} title="Name" />,
      cell: ({ row }) => {
        const p = row.original
        const folder = p.folderId != null ? folderById.get(p.folderId) : undefined
        const isSystem = folder?.kind === 'system'
        return (
          <div className="flex min-w-0 flex-col gap-0.5">
            <div className="flex items-center gap-1.5">
              {isSystem && (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span className="inline-flex shrink-0 items-center text-muted-foreground">
                      <HugeiconsIcon icon={LockedIcon} strokeWidth={2} className="size-3.5" />
                    </span>
                  </TooltipTrigger>
                  <TooltipContent>System prompt — read-only</TooltipContent>
                </Tooltip>
              )}
              <span className="truncate font-medium text-foreground">{p.name}</span>
            </div>
            {p.description && <span className="truncate text-xs text-muted-foreground">{p.description}</span>}
          </div>
        )
      },
      filterFn: (row, _id, value) => {
        const q = String(value ?? '')
          .trim()
          .toLowerCase()
        if (!q) return true
        return (
          row.original.name.toLowerCase().includes(q) || (row.original.description?.toLowerCase().includes(q) ?? false)
        )
      },
    },
    {
      id: 'type',
      header: ({ column }) => <DataTableColumnHeader column={column} title="Type" />,
      cell: ({ row }) => {
        const folder = row.original.folderId != null ? folderById.get(row.original.folderId) : undefined
        const isSystem = folder?.kind === 'system'
        return isSystem ? <Badge variant="outline">System</Badge> : <Badge variant="secondary">User</Badge>
      },
      enableSorting: false,
    },
    {
      id: 'tags',
      header: ({ column }) => <DataTableColumnHeader column={column} title="Tags" />,
      cell: ({ row }) => {
        const tags = row.original.tagIds.map((id) => tagsById.get(id)).filter((t): t is Tag => t != null)
        if (tags.length === 0) return <span className="text-xs text-muted-foreground">—</span>
        const visible = tags.slice(0, 3)
        const overflow = tags.length - visible.length
        return (
          <div className="flex items-center gap-1">
            {visible.map((t) => (
              <TagChip key={t.id} tag={t} />
            ))}
            {overflow > 0 && <span className="text-[10px] text-muted-foreground">+{overflow}</span>}
          </div>
        )
      },
      enableSorting: false,
    },
    {
      accessorKey: 'updatedAt',
      header: ({ column }) => <DataTableColumnHeader column={column} title="Updated" />,
      cell: ({ row }) => (
        <RelativeTime ts={row.original.updatedAt} className="whitespace-nowrap text-muted-foreground" />
      ),
      sortingFn: (a, b) => a.original.updatedAt - b.original.updatedAt,
    },
  ]
}
