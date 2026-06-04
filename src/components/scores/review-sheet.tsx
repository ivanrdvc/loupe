import { StarIcon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { Button } from '#/components/ui/button'
import { Separator } from '#/components/ui/separator'
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from '#/components/ui/sheet'
import { latestScores, SCORE_TONE_DOT, type ScoreTargetKind, summarizeScores } from '#/lib/eval/evaluation'
import { queryKeys } from '#/lib/query-keys'
import { cn } from '#/lib/utils'
import { NoteEditor } from '#/routes/notes/-components/note-editor'
import { listScoresForTarget } from '#/server/scores'
import { GoldenCapturePanel } from './golden-capture'
import { ScoresSection } from './scores-section'
import { useGoldenSnapshot } from './use-golden-snapshot'

type Props = {
  targetKind: ScoreTargetKind
  targetId: string
  parentTraceId?: string | null
  parentSessionId?: string | null
  promptVersionId?: number | null
  label?: string
}

const KIND_DESCRIPTION: Record<ScoreTargetKind, string> = {
  session: 'Scores and notes attached to this session.',
  trace: 'Scores and notes attached to this trace.',
  span: 'Scores and notes attached to this span.',
}

// The inspector's main review surface: scores, notes, and golden capture — used together.
export function ReviewSheetButton({
  targetKind,
  targetId,
  parentTraceId,
  parentSessionId,
  promptVersionId,
  label = 'Review',
}: Props) {
  const [open, setOpen] = useState(false)
  const { data: scores } = useQuery({
    queryKey: queryKeys.scores.byTarget(targetKind, targetId),
    queryFn: () => listScoresForTarget({ data: { targetKind, targetId } }),
  })
  const summary = summarizeScores(scores ?? [])
  const count = latestScores(scores ?? []).length

  const noteTargetKind = targetKind // NoteTargetKind is a superset of ScoreTargetKind

  const { snapshot } = useGoldenSnapshot({ open, targetKind, targetId, parentTraceId })

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button variant={count > 0 ? 'secondary' : 'ghost'} size="sm" aria-label="Review">
          <HugeiconsIcon icon={StarIcon} strokeWidth={2} data-icon="inline-start" />
          {label}
          {summary && (
            <span className={cn('ml-1 size-1.5 shrink-0 rounded-full', SCORE_TONE_DOT[summary.tone])} aria-hidden />
          )}
        </Button>
      </SheetTrigger>
      <SheetContent className="flex flex-col gap-0 sm:max-w-md" onOpenAutoFocus={(e) => e.preventDefault()}>
        <SheetHeader>
          <SheetTitle>Review</SheetTitle>
          <SheetDescription>{KIND_DESCRIPTION[targetKind]}</SheetDescription>
        </SheetHeader>
        <div className="flex-1 space-y-4 overflow-y-auto px-4 pb-6">
          <section>
            <div className="mb-2 flex items-center justify-between">
              <h3 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Scores</h3>
            </div>
            <ScoresSection
              targetKind={targetKind}
              targetId={targetId}
              parentTraceId={parentTraceId}
              parentSessionId={parentSessionId}
              promptVersionId={promptVersionId}
            />
          </section>
          <Separator />
          <section>
            <h3 className="mb-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Notes</h3>
            <NoteEditor
              targetKind={noteTargetKind}
              targetId={targetId}
              parentTraceId={parentTraceId}
              parentSessionId={parentSessionId}
            />
          </section>
          {snapshot && (
            <>
              <Separator />
              <GoldenCapturePanel
                input={snapshot.input}
                sourceTraceId={snapshot.span.traceId}
                sourceSpanId={snapshot.span.id}
              />
            </>
          )}
        </div>
      </SheetContent>
    </Sheet>
  )
}
