import { useQuery } from '@tanstack/react-query'
import { StickyNote } from 'lucide-react'
import { useState } from 'react'
import { Badge } from '#/components/ui/badge'
import { Button } from '#/components/ui/button'
import { Dialog, DialogTrigger } from '#/components/ui/dialog'
import { getNoteForTarget } from '#/features/notes/server'
import { queryKeys } from '#/lib/query-keys'
import { cn } from '#/lib/utils'
import type { NoteTargetKind } from '../types'
import { NoteDialogContent } from './note-dialog-content'

type Props = {
  targetKind: NoteTargetKind
  targetId: string
  parentTraceId?: string | null
  parentSessionId?: string | null
  /** Label shown next to the icon. Defaults to "Note". */
  label?: string
}

export function NoteDialogButton({ targetKind, targetId, parentTraceId, parentSessionId, label = 'Note' }: Props) {
  const [open, setOpen] = useState(false)
  const { data: note } = useQuery({
    queryKey: queryKeys.notes.byTarget(targetKind, targetId),
    queryFn: () => getNoteForTarget({ data: { targetKind, targetId } }),
  })
  const hasNote = Boolean(note)
  const isResolved = note?.status === 'resolved'

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant={hasNote ? 'secondary' : 'ghost'} size="sm" aria-label={hasNote ? 'Edit note' : 'Add note'}>
          <StickyNote data-icon="inline-start" className={cn(hasNote && 'text-foreground')} />
          {label}
          {hasNote ? (
            <Badge
              variant="outline"
              className={cn(
                'ml-1 size-1.5 rounded-full p-0',
                isResolved ? 'border-muted-foreground/40 bg-transparent' : 'bg-primary',
              )}
              aria-hidden
            />
          ) : null}
        </Button>
      </DialogTrigger>
      <NoteDialogContent target={{ targetKind, targetId, parentTraceId, parentSessionId }} />
    </Dialog>
  )
}
