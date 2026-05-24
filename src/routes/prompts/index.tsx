import { Add01Icon, LockedIcon, Refresh01Icon, StickyNote01Icon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { IconSearch } from '@tabler/icons-react'
import { queryOptions, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { createFileRoute, useNavigate } from '@tanstack/react-router'
import {
  type ColumnFiltersState,
  flexRender,
  getCoreRowModel,
  getFacetedRowModel,
  getFacetedUniqueValues,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  type SortingState,
  useReactTable,
} from '@tanstack/react-table'
import { Fragment, useMemo, useState } from 'react'
import { toast } from 'sonner'
import { DataTableFacetedFilter } from '#/components/data-table-faceted-filter'
import { Page } from '#/components/page'
import { Button } from '#/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '#/components/ui/dialog'
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '#/components/ui/empty'
import { Input } from '#/components/ui/input'
import { Label } from '#/components/ui/label'
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from '#/components/ui/select'
import { Skeleton } from '#/components/ui/skeleton'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '#/components/ui/table'
import { Tooltip, TooltipContent, TooltipTrigger } from '#/components/ui/tooltip'
import { queryKeys } from '#/lib/query-keys'
import { cn } from '#/lib/utils'
import { getSyncConfig, syncSystemPrompts } from '#/server/prompt-sync'
import { createFolder, listFolders, listPrompts, listTags } from '#/server/prompts'
import { NewPromptDialog } from './-components/new-prompt-dialog'
import { buildPromptColumns } from './-components/prompts-columns'
import type { PromptFolder } from './-types'

const foldersQuery = queryOptions({
  queryKey: queryKeys.prompts.folders(),
  queryFn: () => listFolders(),
})

const promptsQuery = queryOptions({
  queryKey: queryKeys.prompts.list(),
  queryFn: () => listPrompts({ data: {} }),
})

const tagsQuery = queryOptions({
  queryKey: queryKeys.prompts.tags(),
  queryFn: () => listTags(),
})

const syncConfigQuery = queryOptions({
  queryKey: ['prompts', 'sync-config'] as const,
  queryFn: () => getSyncConfig(),
  staleTime: 30_000,
})

export const Route = createFileRoute('/prompts/')({
  loader: ({ context }) =>
    Promise.all([
      context.queryClient.ensureQueryData(foldersQuery),
      context.queryClient.ensureQueryData(promptsQuery),
      context.queryClient.ensureQueryData(tagsQuery),
      context.queryClient.ensureQueryData(syncConfigQuery),
    ]),
  component: PromptsListPage,
})

const TYPE_OPTIONS = [
  { label: 'System', value: 'system' },
  { label: 'User', value: 'user' },
]

const UNFILED_KEY = '__unfiled__'

function PromptsListPage() {
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const { data: folders = [], isLoading: foldersLoading } = useQuery(foldersQuery)
  const { data: prompts = [], isLoading: promptsLoading } = useQuery(promptsQuery)
  const { data: tags = [] } = useQuery(tagsQuery)
  const { data: syncConfig } = useQuery(syncConfigQuery)

  const [newPromptOpen, setNewPromptOpen] = useState(false)
  const [newFolderOpen, setNewFolderOpen] = useState(false)
  const [defaultFolderId, setDefaultFolderId] = useState<number | null>(null)

  const folderById = useMemo(() => new Map(folders.map((f) => [f.id, f])), [folders])
  const tagsById = useMemo(() => new Map(tags.map((t) => [t.id, t])), [tags])

  const columns = useMemo(() => buildPromptColumns({ folderById, tagsById }), [folderById, tagsById])
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([])
  const [sorting, setSorting] = useState<SortingState>([{ id: 'updatedAt', desc: true }])
  const [pagination, setPagination] = useState({ pageIndex: 0, pageSize: 100 })

  const table = useReactTable({
    data: prompts,
    columns,
    state: { sorting, columnFilters, pagination, columnVisibility: { kind: false, tagIds: false } },
    getRowId: (row) => String(row.id),
    onSortingChange: setSorting,
    onColumnFiltersChange: setColumnFilters,
    onPaginationChange: setPagination,
    getCoreRowModel: getCoreRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFacetedRowModel: getFacetedRowModel(),
    getFacetedUniqueValues: getFacetedUniqueValues(),
  })

  const searchColumn = table.getColumn('name')
  const searchValue = (searchColumn?.getFilterValue() as string) ?? ''
  const isFiltered = table.getState().columnFilters.length > 0

  const syncMutation = useMutation({
    mutationFn: () => syncSystemPrompts(),
    onSuccess: async (result) => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.prompts.all() })
      const parts: string[] = []
      if (result.created) parts.push(`${result.created} created`)
      if (result.updated) parts.push(`${result.updated} updated`)
      if (result.skipped) parts.push(`${result.skipped} unchanged`)
      if (result.errors.length) parts.push(`${result.errors.length} failed`)
      toast.success(parts.length ? `Sync: ${parts.join(', ')}` : 'Sync ran. No prompts found.')
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : String(err)),
  })

  const tagFilterOptions = useMemo(() => tags.map((t) => ({ label: t.name, value: String(t.id) })), [tags])

  const groupedRows = useMemo(() => {
    const visible = table.getRowModel().rows
    type Group = { key: string; folder: PromptFolder | null; rows: typeof visible }
    const map = new Map<string, Group>()
    for (const row of visible) {
      const folderId = row.original.folderId
      const folder = folderId != null ? (folderById.get(folderId) ?? null) : null
      const key = folder ? `f-${folder.id}` : UNFILED_KEY
      const existing = map.get(key)
      if (existing) {
        existing.rows.push(row)
      } else {
        map.set(key, { key, folder, rows: [row] })
      }
    }
    const groups = [...map.values()]
    groups.sort((a, b) => {
      if (a.folder?.kind !== b.folder?.kind) {
        if (a.folder?.kind === 'system') return -1
        if (b.folder?.kind === 'system') return 1
      }
      if (!a.folder) return 1
      if (!b.folder) return -1
      return a.folder.name.localeCompare(b.folder.name)
    })
    return groups
  }, [table, folderById])

  const isLoading = foldersLoading || promptsLoading
  const columnCount = table.getVisibleLeafColumns().length

  return (
    <Page title="Prompts">
      <div className="flex min-w-0 flex-col">
        <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 lg:px-6">
          <div className="flex flex-1 flex-wrap items-center gap-2">
            <div className="relative w-full min-w-0 sm:w-64">
              <IconSearch className="pointer-events-none absolute top-1/2 left-2 size-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Search prompts…"
                value={searchValue}
                onChange={(e) => searchColumn?.setFilterValue(e.target.value)}
                className="h-8 w-full pl-7"
              />
            </div>
            {table.getColumn('kind') && (
              <DataTableFacetedFilter column={table.getColumn('kind')} title="Type" options={TYPE_OPTIONS} />
            )}
            {tagFilterOptions.length > 0 && table.getColumn('tagIds') && (
              <DataTableFacetedFilter column={table.getColumn('tagIds')} title="Tags" options={tagFilterOptions} />
            )}
            {isFiltered && (
              <Button variant="ghost" size="sm" onClick={() => table.resetColumnFilters()}>
                Clear
              </Button>
            )}
          </div>
          <div className="flex items-center gap-2">
            <SyncFromCodeButton
              configured={syncConfig?.configured ?? false}
              repoPath={syncConfig?.repoPath ?? null}
              pending={syncMutation.isPending}
              onSync={() => syncMutation.mutate()}
            />
            <Button variant="outline" size="sm" onClick={() => setNewFolderOpen(true)}>
              New folder
            </Button>
            <Button
              size="sm"
              onClick={() => {
                setDefaultFolderId(null)
                setNewPromptOpen(true)
              }}
            >
              <HugeiconsIcon icon={Add01Icon} strokeWidth={2} data-icon="inline-start" />
              New prompt
            </Button>
          </div>
        </div>

        {isLoading ? (
          <div className="flex flex-col gap-2 p-4 lg:p-6">
            {Array.from({ length: 5 }).map((_, i) => (
              // biome-ignore lint/suspicious/noArrayIndexKey: skeleton placeholders
              <Skeleton key={i} className="h-10 w-full" />
            ))}
          </div>
        ) : prompts.length === 0 ? (
          <Empty>
            <EmptyHeader>
              <EmptyMedia variant="icon" />
              <EmptyTitle>No prompts yet</EmptyTitle>
              <EmptyDescription>Create one to get started, or sync from your agent repo.</EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : (
          <div className="border-t bg-background">
            <Table>
              <TableHeader className="bg-muted/40 [&_th]:font-normal [&_th]:text-muted-foreground [&_button]:font-normal [&_button]:text-muted-foreground">
                {table.getHeaderGroups().map((headerGroup) => (
                  <TableRow
                    key={headerGroup.id}
                    className="[&>:first-child]:pl-4 [&>:last-child]:pr-4 lg:[&>:first-child]:pl-6 lg:[&>:last-child]:pr-6"
                  >
                    {headerGroup.headers.map((header) => (
                      <TableHead key={header.id} colSpan={header.colSpan}>
                        {header.isPlaceholder ? null : flexRender(header.column.columnDef.header, header.getContext())}
                      </TableHead>
                    ))}
                  </TableRow>
                ))}
              </TableHeader>
              <TableBody>
                {groupedRows.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={columnCount} className="h-32 text-center text-muted-foreground">
                      No prompts match the current filters.
                    </TableCell>
                  </TableRow>
                ) : (
                  groupedRows.map((group) => (
                    <Fragment key={group.key}>
                      <TableRow className="hover:bg-transparent">
                        <TableCell
                          colSpan={columnCount}
                          className={cn(
                            'bg-muted/20 py-3 pl-4 text-xs font-medium uppercase tracking-wider text-muted-foreground lg:pl-6',
                          )}
                        >
                          <span className="inline-flex items-center gap-2">
                            {group.folder?.kind === 'system' ? (
                              <HugeiconsIcon icon={LockedIcon} strokeWidth={2} className="size-3.5" />
                            ) : group.folder ? null : (
                              <HugeiconsIcon icon={StickyNote01Icon} strokeWidth={2} className="size-3.5" />
                            )}
                            <span>{group.folder?.name ?? 'Unfiled'}</span>
                            <span className="font-mono normal-case text-muted-foreground">{group.rows.length}</span>
                          </span>
                        </TableCell>
                      </TableRow>
                      {group.rows.map((row) => (
                        <TableRow
                          key={row.id}
                          className="cursor-pointer [&>:first-child]:pl-4 [&>:last-child]:pr-4 lg:[&>:first-child]:pl-6 lg:[&>:last-child]:pr-6"
                          onClick={() =>
                            navigate({ to: '/prompts/$promptId', params: { promptId: String(row.original.id) } })
                          }
                        >
                          {row.getVisibleCells().map((cell) => (
                            <TableCell key={cell.id}>
                              {flexRender(cell.column.columnDef.cell, cell.getContext())}
                            </TableCell>
                          ))}
                        </TableRow>
                      ))}
                    </Fragment>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        )}
      </div>

      <NewPromptDialog
        open={newPromptOpen}
        onOpenChange={setNewPromptOpen}
        folders={folders}
        defaultFolderId={defaultFolderId}
      />
      <NewFolderDialog open={newFolderOpen} onOpenChange={setNewFolderOpen} folders={folders} />
    </Page>
  )
}

function SyncFromCodeButton({
  configured,
  repoPath,
  pending,
  onSync,
}: {
  configured: boolean
  repoPath: string | null
  pending: boolean
  onSync: () => void
}) {
  const button = (
    <Button variant="outline" size="sm" onClick={onSync} disabled={!configured || pending}>
      <HugeiconsIcon icon={Refresh01Icon} strokeWidth={2} data-icon="inline-start" />
      {pending ? 'Syncing…' : 'Sync from code'}
    </Button>
  )
  if (configured && repoPath) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>{button}</TooltipTrigger>
        <TooltipContent side="bottom" className="max-w-xs">
          Reads system prompts from <span className="font-mono text-foreground">{repoPath}</span>
        </TooltipContent>
      </Tooltip>
    )
  }
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span>{button}</span>
      </TooltipTrigger>
      <TooltipContent side="bottom" className="max-w-xs">
        Set <span className="font-mono text-foreground">AGENT_REPO_PATH</span> in{' '}
        <span className="font-mono text-foreground">.env.local</span> to enable sync.
      </TooltipContent>
    </Tooltip>
  )
}

const NO_PARENT_VALUE = '__none__'

function NewFolderDialog({
  open,
  onOpenChange,
  folders,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  folders: PromptFolder[]
}) {
  const queryClient = useQueryClient()
  const [name, setName] = useState('')
  const [parentId, setParentId] = useState<number | null>(null)

  const userFolders = folders.filter((f) => f.kind === 'user')

  const mutation = useMutation({
    mutationFn: () => createFolder({ data: { name: name.trim(), parentId } }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.prompts.folders() })
      toast.success('Folder created')
      setName('')
      setParentId(null)
      onOpenChange(false)
    },
  })

  const canSubmit = name.trim().length > 0 && !mutation.isPending

  return (
    <Dialog
      open={open}
      onOpenChange={(value) => {
        onOpenChange(value)
        if (!value) {
          setName('')
          setParentId(null)
        }
      }}
    >
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>New folder</DialogTitle>
          <DialogDescription>Group prompts. Pick a parent to nest.</DialogDescription>
        </DialogHeader>
        <form
          className="flex flex-col gap-3"
          onSubmit={(e) => {
            e.preventDefault()
            if (canSubmit) mutation.mutate()
          }}
        >
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="new-folder-name">Name</Label>
            <Input
              id="new-folder-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. experiments"
              autoFocus
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="new-folder-parent">Parent</Label>
            <Select
              value={parentId == null ? NO_PARENT_VALUE : String(parentId)}
              onValueChange={(v) => setParentId(v === NO_PARENT_VALUE ? null : Number(v))}
            >
              <SelectTrigger id="new-folder-parent">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  <SelectItem value={NO_PARENT_VALUE}>Top level</SelectItem>
                  {userFolders.map((f) => (
                    <SelectItem key={f.id} value={String(f.id)}>
                      {f.name}
                    </SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={!canSubmit}>
              {mutation.isPending ? 'Creating…' : 'Create'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
