import { Add01Icon, FolderAddIcon, StickyNote01Icon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { IconChevronRight, IconFile, IconFolder } from '@tabler/icons-react'
import { queryOptions, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { createFileRoute, Link } from '@tanstack/react-router'
import { useMemo, useState } from 'react'
import { toast } from 'sonner'
import { Page } from '#/components/page'
import { Badge } from '#/components/ui/badge'
import { Button } from '#/components/ui/button'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '#/components/ui/collapsible'
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from '#/components/ui/tabs'
import { queryKeys } from '#/lib/query-keys'
import { createFolder, listFolders, listPrompts } from '#/server/prompts'
import { NewPromptDialog } from './-components/new-prompt-dialog'
import type { Prompt, PromptFolder } from './-types'

const foldersQuery = () =>
  queryOptions({
    queryKey: queryKeys.prompts.folders(),
    queryFn: () => listFolders(),
  })

const promptsQuery = () =>
  queryOptions({
    queryKey: queryKeys.prompts.list(),
    queryFn: () => listPrompts({ data: {} }),
  })

export const Route = createFileRoute('/prompts/')({
  loader: ({ context }) =>
    Promise.all([
      context.queryClient.ensureQueryData(foldersQuery()),
      context.queryClient.ensureQueryData(promptsQuery()),
    ]),
  component: PromptsListPage,
})

function PromptsListPage() {
  const { data: folders = [], isLoading: foldersLoading } = useQuery(foldersQuery())
  const { data: prompts = [], isLoading: promptsLoading } = useQuery(promptsQuery())
  const [tab, setTab] = useState<'snippets' | 'observed'>('snippets')
  const [newPromptOpen, setNewPromptOpen] = useState(false)
  const [newFolderOpen, setNewFolderOpen] = useState(false)
  const [defaultFolderId, setDefaultFolderId] = useState<number | null>(null)

  const isLoading = foldersLoading || promptsLoading

  return (
    <Page title="Prompts">
      <div className="flex flex-col gap-4 px-4 lg:px-6">
        <Tabs value={tab} onValueChange={(v) => setTab(v as typeof tab)}>
          <div className="flex items-center justify-between gap-2">
            <TabsList>
              <TabsTrigger value="snippets">Snippets</TabsTrigger>
              <TabsTrigger value="observed">Observed</TabsTrigger>
            </TabsList>
            {tab === 'snippets' && (
              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" onClick={() => setNewFolderOpen(true)}>
                  <HugeiconsIcon icon={FolderAddIcon} strokeWidth={2} data-icon="inline-start" />
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
            )}
          </div>

          <TabsContent value="snippets" className="pt-4">
            {isLoading ? (
              <TreeSkeleton />
            ) : folders.length === 0 && prompts.length === 0 ? (
              <Empty>
                <EmptyHeader>
                  <EmptyMedia variant="icon">
                    <IconFile />
                  </EmptyMedia>
                  <EmptyTitle>No prompts yet</EmptyTitle>
                  <EmptyDescription>Create a folder to organise your prompts, or jump straight in.</EmptyDescription>
                </EmptyHeader>
              </Empty>
            ) : (
              <FolderTree
                folders={folders}
                prompts={prompts}
                onNewPromptInFolder={(folderId) => {
                  setDefaultFolderId(folderId)
                  setNewPromptOpen(true)
                }}
              />
            )}
          </TabsContent>

          <TabsContent value="observed" className="pt-4">
            <Empty>
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <HugeiconsIcon icon={StickyNote01Icon} />
                </EmptyMedia>
                <EmptyTitle>Detected from your traces</EmptyTitle>
                <EmptyDescription>
                  Coming soon — agentops will fingerprint your real system prompts and show their change history here.
                </EmptyDescription>
              </EmptyHeader>
            </Empty>
          </TabsContent>
        </Tabs>
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

type TreeNode =
  | { type: 'folder'; folder: PromptFolder; children: TreeNode[]; prompts: Prompt[] }
  | { type: 'prompt'; prompt: Prompt }

function buildTree(folders: PromptFolder[], prompts: Prompt[]): { tree: TreeNode[]; unfiled: Prompt[] } {
  const byParent = new Map<number | null, PromptFolder[]>()
  for (const f of folders) {
    const list = byParent.get(f.parentId) ?? []
    list.push(f)
    byParent.set(f.parentId, list)
  }
  const promptsByFolder = new Map<number | null, Prompt[]>()
  for (const p of prompts) {
    const list = promptsByFolder.get(p.folderId) ?? []
    list.push(p)
    promptsByFolder.set(p.folderId, list)
  }
  const build = (parentId: number | null): TreeNode[] => {
    const children = (byParent.get(parentId) ?? []).sort((a, b) => a.name.localeCompare(b.name))
    return children.map((folder): TreeNode => {
      const folderPrompts = (promptsByFolder.get(folder.id) ?? []).sort((a, b) => a.name.localeCompare(b.name))
      return {
        type: 'folder',
        folder,
        children: build(folder.id),
        prompts: folderPrompts,
      }
    })
  }
  const tree = build(null)
  const unfiled = (promptsByFolder.get(null) ?? []).sort((a, b) => a.name.localeCompare(b.name))
  return { tree, unfiled }
}

function FolderTree({
  folders,
  prompts,
  onNewPromptInFolder,
}: {
  folders: PromptFolder[]
  prompts: Prompt[]
  onNewPromptInFolder: (folderId: number | null) => void
}) {
  const { tree, unfiled } = useMemo(() => buildTree(folders, prompts), [folders, prompts])

  return (
    <div className="rounded-lg border p-2 text-sm">
      {tree.map((node) => (
        <TreeNodeView
          key={node.type === 'folder' ? `f-${node.folder.id}` : `p-${node.prompt.id}`}
          node={node}
          onNewPromptInFolder={onNewPromptInFolder}
        />
      ))}
      {unfiled.length > 0 && (
        <div className="mt-2">
          <div className="px-2 pb-1 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Unfiled</div>
          {unfiled.map((p) => (
            <PromptLeaf key={p.id} prompt={p} />
          ))}
        </div>
      )}
    </div>
  )
}

function TreeNodeView({
  node,
  onNewPromptInFolder,
}: {
  node: TreeNode
  onNewPromptInFolder: (folderId: number | null) => void
}) {
  if (node.type === 'prompt') {
    return <PromptLeaf prompt={node.prompt} />
  }

  const { folder, children, prompts } = node
  const count = children.length + prompts.length
  const hasChildren = children.length + prompts.length > 0
  return (
    <Collapsible defaultOpen className="group/folder">
      <div className="flex items-center gap-0.5 pr-1">
        <CollapsibleTrigger className="flex flex-1 items-center gap-1.5 rounded-md px-1.5 py-1 text-left outline-none hover:bg-accent/60 focus-visible:ring-2 focus-visible:ring-ring">
          <IconChevronRight className="size-3.5 shrink-0 text-muted-foreground transition-transform group-data-[state=open]/folder:rotate-90" />
          <IconFolder className="size-3.5 shrink-0 text-muted-foreground" />
          <span className="truncate">{folder.name}</span>
          {folder.kind === 'system' && (
            <Badge variant="outline" className="ml-1 text-[10px]">
              system
            </Badge>
          )}
          {count > 0 && <span className="ml-auto text-[11px] tabular-nums text-muted-foreground">{count}</span>}
        </CollapsibleTrigger>
        {folder.kind !== 'system' && (
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label="New prompt in this folder"
            onClick={() => onNewPromptInFolder(folder.id)}
          >
            <HugeiconsIcon icon={Add01Icon} strokeWidth={2} className="size-3.5" />
          </Button>
        )}
      </div>
      {hasChildren && (
        <CollapsibleContent>
          <div className="ml-[13px] border-l border-border/70 pl-2">
            {children.map((child) => (
              <TreeNodeView
                key={child.type === 'folder' ? `f-${child.folder.id}` : `p-${child.prompt.id}`}
                node={child}
                onNewPromptInFolder={onNewPromptInFolder}
              />
            ))}
            {prompts.map((p) => (
              <PromptLeaf key={p.id} prompt={p} />
            ))}
          </div>
        </CollapsibleContent>
      )}
    </Collapsible>
  )
}

function PromptLeaf({ prompt }: { prompt: Prompt }) {
  return (
    <Link
      to="/prompts/$promptId"
      params={{ promptId: String(prompt.id) }}
      className="flex items-center gap-1.5 rounded-md py-1 pl-1.5 pr-2 text-left outline-none hover:bg-accent/60 focus-visible:ring-2 focus-visible:ring-ring"
    >
      <IconFile className="size-3.5 shrink-0 text-muted-foreground" />
      <span className="truncate">{prompt.name}</span>
      {prompt.description && <span className="ml-2 truncate text-xs text-muted-foreground">{prompt.description}</span>}
    </Link>
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

function TreeSkeleton() {
  return (
    <div className="flex flex-col gap-1">
      {Array.from({ length: 4 }).map((_, i) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: skeleton items have no stable key
        <Skeleton key={i} className="h-7 w-full max-w-md" />
      ))}
    </div>
  )
}
