import { Delete02Icon, Edit02Icon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { Markdown } from '#/components/markdown'
import { Button } from '#/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '#/components/ui/dialog'
import { Skeleton } from '#/components/ui/skeleton'
import { Textarea } from '#/components/ui/textarea'
import { Tooltip, TooltipContent, TooltipTrigger } from '#/components/ui/tooltip'
import { useUser } from '#/hooks/use-user'
import { formatAgo } from '#/lib/format'
import { queryKeys } from '#/lib/query-keys'
import { cn } from '#/lib/utils'
import { deleteNote, getNoteForTarget, upsertNote } from '#/server/notes'
import type { NoteTargetKind } from '../-types'

type Props = {
  targetKind: NoteTargetKind
  targetId: string
  parentTraceId?: string | null
  parentSessionId?: string | null
  compact?: boolean
  variant?: 'default' | 'inline'
  emptyLabel?: string
}

const KIND_LABEL: Record<NoteTargetKind, string> = {
  session: 'session',
  trace: 'trace',
  span: 'span',
  prompt: 'prompt',
  experiment: 'experiment',
}

export function NoteEditor({
  targetKind,
  targetId,
  parentTraceId,
  parentSessionId,
  compact = false,
  variant = 'default',
  emptyLabel,
}: Props) {
  const user = useUser()
  const queryClient = useQueryClient()
  const {
    data: note,
    isLoading,
    isFetching,
  } = useQuery({
    queryKey: queryKeys.notes.byTarget(targetKind, targetId),
    queryFn: () => getNoteForTarget({ data: { targetKind, targetId } }),
  })

  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState('')
  const [deleteOpen, setDeleteOpen] = useState(false)

  useEffect(() => {
    if (!editing) setDraft(note?.body ?? '')
  }, [note, editing])

  const invalidate = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: queryKeys.notes.byTarget(targetKind, targetId) }),
      queryClient.invalidateQueries({ queryKey: queryKeys.notes.list() }),
      queryClient.invalidateQueries({ queryKey: queryKeys.notes.flagsForKind(targetKind) }),
    ])
  }

  const saveMutation = useMutation({
    mutationFn: (body: string) =>
      upsertNote({
        data: {
          targetKind,
          targetId,
          parentTraceId,
          parentSessionId,
          body: body.trim(),
          author: user.name,
        },
      }),
    onSuccess: async () => {
      await invalidate()
      setEditing(false)
      toast.success('Note saved')
    },
  })

  const deleteMutation = useMutation({
    mutationFn: (id: number) => deleteNote({ data: id }),
    onSuccess: async () => {
      await invalidate()
      setDeleteOpen(false)
      setEditing(false)
      toast.success('Note deleted')
    },
  })

  if (isLoading) {
    return (
      <div className={cn('flex flex-col gap-2', compact ? 'py-1' : 'py-2')}>
        <Skeleton className={compact ? 'h-12 w-full' : 'h-20 w-full'} />
      </div>
    )
  }

  const handleSave = () => {
    if (!draft.trim()) return
    saveMutation.mutate(draft)
  }

  const handleCancel = () => {
    setDraft(note?.body ?? '')
    setEditing(false)
  }

  if (editing || (!note && draft)) {
    return (
      <div className={cn('flex flex-col gap-2', compact ? 'py-1' : 'py-2')}>
        <Textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="Write a note. Markdown supported."
          rows={compact ? 3 : 6}
          autoFocus
        />
        <div className={cn('flex items-center', compact ? 'gap-1.5' : 'gap-2')}>
          <Button size="sm" onClick={handleSave} disabled={saveMutation.isPending || !draft.trim()}>
            {saveMutation.isPending ? 'Saving…' : 'Save'}
          </Button>
          <Button size="sm" variant="ghost" onClick={handleCancel} disabled={saveMutation.isPending}>
            Cancel
          </Button>
        </div>
      </div>
    )
  }

  if (!note) {
    if (variant === 'inline') {
      return (
        <div className="flex items-center justify-between gap-3 text-xs text-muted-foreground">
          <span>{emptyLabel ?? `Add a note about this ${KIND_LABEL[targetKind]}`}</span>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => {
              setDraft('')
              setEditing(true)
            }}
          >
            Add
          </Button>
        </div>
      )
    }
    return (
      <div
        className={cn(
          'flex items-center justify-between gap-3 rounded-lg border border-dashed text-xs text-muted-foreground',
          compact ? 'px-3 py-2' : 'px-4 py-3',
        )}
      >
        <span>No note yet.</span>
        <Button
          size="sm"
          variant="outline"
          onClick={() => {
            setDraft('')
            setEditing(true)
          }}
        >
          Add note
        </Button>
      </div>
    )
  }

  return (
    <div
      className={cn(
        'flex flex-col gap-2 rounded-lg border bg-card',
        compact ? 'px-3 py-2' : 'px-4 py-3',
        isFetching && 'opacity-80',
      )}
    >
      <Markdown>{note.body}</Markdown>
      <div className="flex items-center justify-between gap-2 border-border border-t pt-2 text-[11px] text-muted-foreground">
        <span title={new Date(note.updatedAt).toLocaleString()}>
          by {note.author} · {formatAgo(note.updatedAt)}
        </span>
        <div className="flex items-center gap-0.5">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                size="icon-sm"
                variant="ghost"
                aria-label="Edit note"
                onClick={() => {
                  setDraft(note.body)
                  setEditing(true)
                }}
              >
                <HugeiconsIcon icon={Edit02Icon} strokeWidth={2} />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Edit</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                size="icon-sm"
                variant="ghost"
                aria-label="Delete note"
                className="text-muted-foreground hover:text-destructive"
                onClick={() => setDeleteOpen(true)}
              >
                <HugeiconsIcon icon={Delete02Icon} strokeWidth={2} />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Delete</TooltipContent>
          </Tooltip>
        </div>
      </div>

      <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete this note?</DialogTitle>
            <DialogDescription>The note will be removed. This can't be undone.</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteOpen(false)} disabled={deleteMutation.isPending}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => deleteMutation.mutate(note.id)}
              disabled={deleteMutation.isPending}
            >
              {deleteMutation.isPending ? 'Deleting…' : 'Confirm'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
