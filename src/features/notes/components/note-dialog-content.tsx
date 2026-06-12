import { DialogContent, DialogDescription, DialogHeader, DialogTitle } from '#/components/ui/dialog'
import { ScrollArea } from '#/components/ui/scroll-area'
import type { NoteTargetKind } from '../types'
import { NoteEditor } from './note-editor'

const KIND_DESCRIPTION: Record<NoteTargetKind, string> = {
  session: 'Notes attached to this session — visible to your team.',
  trace: 'Notes attached to this trace.',
  span: 'Notes attached to this span.',
  prompt: 'Notes attached to this prompt.',
  experiment: 'Notes attached to this experiment.',
}

export interface NoteDialogTarget {
  targetKind: NoteTargetKind
  targetId: string
  parentTraceId?: string | null
  parentSessionId?: string | null
}

// Nullable target keeps DialogContent mounted through the exit animation
// when a controlled caller clears its active note on close.
export function NoteDialogContent({ target }: { target: NoteDialogTarget | null }) {
  return (
    <DialogContent className="sm:max-w-lg" onOpenAutoFocus={(event) => event.preventDefault()}>
      <DialogHeader>
        <DialogTitle>Note</DialogTitle>
        <DialogDescription>{target ? KIND_DESCRIPTION[target.targetKind] : null}</DialogDescription>
      </DialogHeader>
      <ScrollArea className="-mx-1 [&>[data-slot=scroll-area-viewport]]:max-h-[70vh]">
        <div className="flex flex-col gap-4 px-1">
          {target && (
            <NoteEditor
              key={target.targetId}
              targetKind={target.targetKind}
              targetId={target.targetId}
              parentTraceId={target.parentTraceId}
              parentSessionId={target.parentSessionId}
            />
          )}
        </div>
      </ScrollArea>
    </DialogContent>
  )
}
