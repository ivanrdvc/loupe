import { StickyNote01Icon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { useQuery } from '@tanstack/react-query'
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
import { queryKeys } from '#/lib/query-keys'
import { cn } from '#/lib/utils'
import { getNoteForTarget } from '#/server/notes'
import type { NoteTargetKind } from '../-types'
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

export function NoteSheetButton({ targetKind, targetId, parentTraceId, parentSessionId, label = 'Note' }: Props) {
  const [open, setOpen] = useState(false)
  const { data: note } = useQuery({
    queryKey: queryKeys.notes.byTarget(targetKind, targetId),
    queryFn: () => getNoteForTarget({ data: { targetKind, targetId } }),
  })
  const hasNote = Boolean(note)

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant={hasNote ? 'secondary' : 'ghost'} size="sm" aria-label={hasNote ? 'Edit note' : 'Add note'}>
          <HugeiconsIcon
            icon={StickyNote01Icon}
            strokeWidth={2}
            data-icon="inline-start"
            className={cn(hasNote && 'text-foreground')}
          />
          {label}
          {hasNote ? (
            <Badge variant="outline" className="ml-1 size-1.5 rounded-full bg-primary p-0" aria-hidden />
          ) : null}
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Note</DialogTitle>
          <DialogDescription>{KIND_DESCRIPTION[targetKind]}</DialogDescription>
        </DialogHeader>
        <NoteEditor
          targetKind={targetKind}
          targetId={targetId}
          parentTraceId={parentTraceId}
          parentSessionId={parentSessionId}
        />
      </DialogContent>
    </Dialog>
  )
}
