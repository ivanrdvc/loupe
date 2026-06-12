import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { CircleCheck, Link2, RotateCw, SquarePen, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'
import { Markdown } from '#/components/markdown'
import { RelativeTime } from '#/components/relative-time'
import { Badge } from '#/components/ui/badge'
import { Button } from '#/components/ui/button'
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '#/components/ui/dialog'
import { Skeleton } from '#/components/ui/skeleton'
import { Textarea } from '#/components/ui/textarea'
import { Tooltip, TooltipContent, TooltipTrigger } from '#/components/ui/tooltip'
import { deleteNote, getNoteForTarget, setNoteStatus, upsertNote } from '#/features/notes/server'
import { useUser } from '#/hooks/use-user'
import { queryKeys } from '#/lib/query-keys'
import { cn } from '#/lib/utils'
import type { NoteTargetKind } from '../types'

type Props = {
  targetKind: NoteTargetKind
  targetId: string
  parentTraceId?: string | null
  parentSessionId?: string | null
}

export function NoteEditor({ targetKind, targetId, parentTraceId, parentSessionId }: Props) {
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

  const statusMutation = useMutation({
    mutationFn: (input: { id: number; status: 'open' | 'resolved' }) => setNoteStatus({ data: input }),
    onSuccess: async (next) => {
      await invalidate()
      toast.success(next.status === 'resolved' ? 'Note resolved' : 'Note reopened')
    },
  })

  if (isLoading) {
    return (
      <div className="flex flex-col gap-2 py-2">
        <Skeleton className="h-20 w-full" />
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

  if (editing) {
    return (
      <div className="flex flex-col gap-2 py-2">
        <Textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="Write a note. Markdown supported."
          rows={6}
          autoFocus
        />
        <div className="flex items-center gap-2">
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
    return (
      <div className="flex items-center justify-between gap-3 rounded-lg border border-dashed px-4 py-3 text-xs text-muted-foreground">
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

  const isResolved = note.status === 'resolved'
  const toggleStatus = () => {
    statusMutation.mutate({ id: note.id, status: isResolved ? 'open' : 'resolved' })
  }

  const copyLink = async () => {
    if (typeof window === 'undefined') return
    const url = `${window.location.origin}/notes?note=${note.id}`
    try {
      await navigator.clipboard.writeText(url)
      toast.success('Link copied')
    } catch {
      toast.error('Could not copy link')
    }
  }

  return (
    <div className={cn('flex flex-col gap-2 rounded-lg border bg-card px-4 py-3', isFetching && 'opacity-80')}>
      {isResolved && (
        <div className="flex items-center gap-1.5">
          <Badge variant="outline" className="gap-1 text-muted-foreground">
            <CircleCheck />
            Resolved
          </Badge>
          {note.resolvedAt && <RelativeTime ts={note.resolvedAt} className="text-[11px] text-muted-foreground" />}
        </div>
      )}
      <div className={cn(isResolved && 'text-muted-foreground')}>
        <Markdown>{note.body}</Markdown>
      </div>
      <div className="flex items-center justify-between gap-2 border-border border-t pt-2 text-[11px] text-muted-foreground">
        <span>
          by {note.author} · <RelativeTime ts={note.updatedAt} />
        </span>
        <div className="flex items-center gap-0.5">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                size="icon-sm"
                variant="ghost"
                aria-label={isResolved ? 'Reopen note' : 'Resolve note'}
                disabled={statusMutation.isPending}
                onClick={toggleStatus}
              >
                {isResolved ? <RotateCw /> : <CircleCheck />}
              </Button>
            </TooltipTrigger>
            <TooltipContent>{isResolved ? 'Reopen' : 'Resolve'}</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button size="icon-sm" variant="ghost" aria-label="Copy link to note" onClick={copyLink}>
                <Link2 />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Copy link</TooltipContent>
          </Tooltip>
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
                <SquarePen />
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
                <Trash2 />
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
            <DialogClose asChild>
              <Button variant="outline" disabled={deleteMutation.isPending}>
                Cancel
              </Button>
            </DialogClose>
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
