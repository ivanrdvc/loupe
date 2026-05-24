import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'
import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { Button } from '#/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '#/components/ui/dialog'
import { Input } from '#/components/ui/input'
import { Label } from '#/components/ui/label'
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from '#/components/ui/select'
import { queryKeys } from '#/lib/query-keys'
import { duplicatePrompt } from '#/server/prompts'
import type { Prompt, PromptFolder } from '../-types'

const NO_FOLDER_VALUE = '__none__'

export function DuplicatePromptDialog({
  open,
  onOpenChange,
  source,
  folders,
  forceUserFolder,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  source: Prompt
  folders: PromptFolder[]
  forceUserFolder: boolean
}) {
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const userFolders = folders.filter((f) => f.kind === 'user')
  const defaultFolderId = forceUserFolder
    ? (userFolders[0]?.id ?? null)
    : source.folderId !== null && folders.find((f) => f.id === source.folderId)?.kind === 'user'
      ? source.folderId
      : (userFolders[0]?.id ?? null)
  const [name, setName] = useState(`${source.name}-copy`)
  const [folderId, setFolderId] = useState<number | null>(defaultFolderId)

  useEffect(() => {
    if (open) {
      setName(`${source.name}-copy`)
      setFolderId(defaultFolderId)
    }
  }, [open, source.name, defaultFolderId])

  const mutation = useMutation({
    mutationFn: () =>
      duplicatePrompt({
        data: { promptId: source.id, newName: name.trim(), targetFolderId: folderId },
      }),
    onSuccess: async (result) => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.prompts.all() })
      toast.success('Prompt duplicated')
      onOpenChange(false)
      void navigate({ to: '/prompts/$promptId', params: { promptId: String(result.prompt.id) } })
    },
    onError: (err) => {
      toast.error(err instanceof Error ? err.message : String(err))
    },
  })

  const canSubmit = name.trim().length > 0 && !mutation.isPending

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Duplicate prompt</DialogTitle>
          <DialogDescription>
            {forceUserFolder
              ? 'System prompts are read-only. Pick a destination folder to clone into.'
              : 'Copies the latest version. Edits to the duplicate won’t affect the original.'}
          </DialogDescription>
        </DialogHeader>
        <form
          className="flex flex-col gap-4"
          onSubmit={(e) => {
            e.preventDefault()
            if (canSubmit) mutation.mutate()
          }}
        >
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="duplicate-name">Name</Label>
            <Input id="duplicate-name" value={name} onChange={(e) => setName(e.target.value)} autoFocus />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="duplicate-folder">Folder</Label>
            <Select
              value={folderId == null ? NO_FOLDER_VALUE : String(folderId)}
              onValueChange={(v) => setFolderId(v === NO_FOLDER_VALUE ? null : Number(v))}
            >
              <SelectTrigger id="duplicate-folder">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  <SelectItem value={NO_FOLDER_VALUE}>No folder</SelectItem>
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
              {mutation.isPending ? 'Duplicating…' : 'Duplicate'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
