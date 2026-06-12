import { useQuery } from '@tanstack/react-query'
import { StickyNote } from 'lucide-react'
import { useState } from 'react'
import { Badge } from '#/components/ui/badge'
import { Button } from '#/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '#/components/ui/dialog'
import { ScrollArea } from '#/components/ui/scroll-area'
import { getNoteForTarget } from '#/features/notes/server'
import { queryKeys } from '#/lib/query-keys'
import { cn } from '#/lib/utils'
import type { NoteTargetKind } from '../types'
import { NoteEditor } from './note-editor'

type Props = {
  targetKind: NoteTargetKind
  targetId: string
  parentTraceId?: string | null
  parentSessionId?: string | null
  /** Label shown next to the icon. Defaults to "Note". */
  label?: string
}

const KIND_DESCRIPTION: Record<NoteTargetKind, string> = {
  session: 'Notes attached to this session — visible to your team.',
  trace: 'Notes attached to this trace.',
  span: 'Notes attached to this span.',
  prompt: 'Notes attached to this prompt.',
  experiment: 'Notes attached to this experiment.',
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
      <DialogContent className="sm:max-w-lg" onOpenAutoFocus={(event) => event.preventDefault()}>
        <DialogHeader>
          <DialogTitle>Note</DialogTitle>
          <DialogDescription>{KIND_DESCRIPTION[targetKind]}</DialogDescription>
        </DialogHeader>
        <ScrollArea className="-mx-1 [&>[data-slot=scroll-area-viewport]]:max-h-[70vh]">
          <div className="flex flex-col gap-4 px-1">
            <NoteEditor
              targetKind={targetKind}
              targetId={targetId}
              parentTraceId={parentTraceId}
              parentSessionId={parentSessionId}
            />
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  )
}
