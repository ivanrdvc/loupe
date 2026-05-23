import { StickyNote01Icon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { Badge } from '#/components/ui/badge'
import { Button } from '#/components/ui/button'
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from '#/components/ui/sheet'
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
  const isResolved = note?.status === 'resolved'

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button variant={hasNote ? 'secondary' : 'ghost'} size="sm" aria-label={hasNote ? 'Edit note' : 'Add note'}>
          <HugeiconsIcon
            icon={StickyNote01Icon}
            strokeWidth={2}
            data-icon="inline-start"
            className={cn(hasNote && 'text-foreground')}
          />
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
      </SheetTrigger>
      <SheetContent className="flex flex-col gap-0 sm:max-w-md" onOpenAutoFocus={(event) => event.preventDefault()}>
        <SheetHeader>
          <SheetTitle>Note</SheetTitle>
          <SheetDescription>{KIND_DESCRIPTION[targetKind]}</SheetDescription>
        </SheetHeader>
        <div className="flex-1 overflow-y-auto px-4 pb-4">
          <NoteEditor
            targetKind={targetKind}
            targetId={targetId}
            parentTraceId={parentTraceId}
            parentSessionId={parentSessionId}
          />
        </div>
      </SheetContent>
    </Sheet>
  )
}
