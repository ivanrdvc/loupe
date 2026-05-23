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
import { Textarea } from '#/components/ui/textarea'
import { useUser } from '#/hooks/use-user'
import { queryKeys } from '#/lib/query-keys'
import { createPrompt } from '#/server/prompts'
import type { PromptFolder } from '../-types'

const NO_FOLDER_VALUE = '__none__'

export function NewPromptDialog({
  open,
  onOpenChange,
  folders,
  defaultFolderId,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  folders: PromptFolder[]
  defaultFolderId?: number | null
}) {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const user = useUser()
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [folderId, setFolderId] = useState<number | null>(defaultFolderId ?? null)

  useEffect(() => {
    if (open) setFolderId(defaultFolderId ?? null)
  }, [open, defaultFolderId])

  const mutation = useMutation({
    mutationFn: () =>
      createPrompt({
        data: {
          folderId,
          name: name.trim(),
          description: description.trim() || null,
          author: user.name,
        },
      }),
    onSuccess: async (result) => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.prompts.all() })
      toast.success('Prompt created')
      onOpenChange(false)
      setName('')
      setDescription('')
      void navigate({ to: '/prompts/$promptId', params: { promptId: String(result.prompt.id) } })
    },
  })

  const canSubmit = name.trim().length > 0 && !mutation.isPending

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>New prompt</DialogTitle>
          <DialogDescription>Give it a name and a short description. You can edit messages next.</DialogDescription>
        </DialogHeader>
        <form
          className="flex flex-col gap-4"
          onSubmit={(e) => {
            e.preventDefault()
            if (canSubmit) mutation.mutate()
          }}
        >
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="new-prompt-name">Name</Label>
            <Input
              id="new-prompt-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. title-generator"
              autoFocus
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="new-prompt-folder">Folder</Label>
            <Select
              value={folderId == null ? NO_FOLDER_VALUE : String(folderId)}
              onValueChange={(v) => setFolderId(v === NO_FOLDER_VALUE ? null : Number(v))}
            >
              <SelectTrigger id="new-prompt-folder">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  <SelectItem value={NO_FOLDER_VALUE}>No folder</SelectItem>
                  {folders.map((f) => (
                    <SelectItem key={f.id} value={String(f.id)}>
                      {f.name}
                    </SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="new-prompt-description">Description</Label>
            <Textarea
              id="new-prompt-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="What this prompt does."
              rows={3}
            />
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
