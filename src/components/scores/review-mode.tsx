import { ArrowLeft01Icon, ArrowRight01Icon, Cancel01Icon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'
import { JsonView } from '#/components/ai-elements/json-view'
import { GoldenCapturePanel } from '#/components/scores/golden-capture'
import { type ScoreDraft, ScoreInput } from '#/components/scores/score-input'
import { useGoldenSnapshot } from '#/components/scores/use-golden-snapshot'
import { Button } from '#/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '#/components/ui/dialog'
import { Progress } from '#/components/ui/progress'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '#/components/ui/select'
import { Skeleton } from '#/components/ui/skeleton'
import { useUser } from '#/hooks/use-user'
import { draftIsBad, type ScoreTargetKind } from '#/lib/eval/evaluation'
import { queryKeys } from '#/lib/query-keys'
import type { Span } from '#/lib/spans'
import { asMessages } from '#/lib/spans/conversation'
import { listScoreConfigs, listScoresForTarget, upsertHumanScore } from '#/server/scores'

export type ReviewQueueItem = {
  targetKind: ScoreTargetKind
  targetId: string
  parentTraceId?: string | null
  parentSessionId?: string | null
  title: string
  /** When set, load spans for preview + golden capture. */
  traceId?: string | null
  previewText?: string | null
}

type Props = {
  open: boolean
  onOpenChange: (open: boolean) => void
  items: ReviewQueueItem[]
}

// Keyboard-driven one-at-a-time labeling over a filtered trace/session list.
export function ReviewModeDialog({ open, onOpenChange, items }: Props) {
  const user = useUser()
  const queryClient = useQueryClient()
  const [index, setIndex] = useState(0)
  const [dimension, setDimension] = useState<string | null>(null)
  const [goldenHighlight, setGoldenHighlight] = useState(false)

  const { data: configs = [] } = useQuery({
    queryKey: queryKeys.scores.configs(),
    queryFn: () => listScoreConfigs(),
    enabled: open,
  })
  const activeConfigs = useMemo(() => configs.filter((c) => !c.archived), [configs])

  useEffect(() => {
    if (!open) return
    setIndex(0)
    setGoldenHighlight(false)
    if (!dimension && activeConfigs.length > 0) setDimension(activeConfigs[0]?.name ?? null)
  }, [open, activeConfigs, dimension])

  const item = items[index]
  const config = dimension ? activeConfigs.find((c) => c.name === dimension) : undefined

  const { data: scores } = useQuery({
    queryKey: queryKeys.scores.byTarget(item?.targetKind ?? 'trace', item?.targetId ?? ''),
    queryFn: () => listScoresForTarget({ data: { targetKind: item!.targetKind, targetId: item!.targetId } }),
    enabled: open && item != null,
  })

  const myScore = useMemo(
    () => scores?.find((s) => s.source === 'human' && s.evaluator === user.name && s.name === dimension),
    [scores, user.name, dimension],
  )

  const {
    snapshot,
    traceData,
    isLoading: traceLoading,
    traceId,
  } = useGoldenSnapshot({
    open,
    targetKind: item?.targetKind ?? 'trace',
    targetId: item?.targetId,
    parentTraceId: item?.parentTraceId,
    traceId: item?.traceId,
  })

  const invalidate = useCallback(async () => {
    if (!item) return
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: queryKeys.scores.byTarget(item.targetKind, item.targetId) }),
      queryClient.invalidateQueries({ queryKey: ['scores', 'summaries'] }),
    ])
  }, [queryClient, item])

  const upsertMutation = useMutation({
    mutationFn: (draft: ScoreDraft) =>
      upsertHumanScore({
        data: {
          targetKind: item!.targetKind,
          targetId: item!.targetId,
          parentTraceId: item!.parentTraceId,
          parentSessionId: item!.parentSessionId,
          name: config!.name,
          dataType: config!.dataType,
          value: draft.value,
          label: draft.label,
          explanation: draft.explanation,
          evaluator: user.name,
        },
      }),
    onSuccess: async (_row, draft) => {
      await invalidate()
      if (config && draftIsBad(config, draft)) setGoldenHighlight(true)
      toast.success('Score saved')
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : 'Could not save score'),
  })

  const advance = useCallback(() => {
    setGoldenHighlight(false)
    setIndex((i) => Math.min(i + 1, Math.max(items.length - 1, 0)))
  }, [items.length])

  // A bad mark stays put so golden capture can pulse; a good mark moves on.
  const saveAndAdvance = useCallback(
    (draft: ScoreDraft) => {
      upsertMutation.mutate(draft, {
        onSuccess: () => {
          if (!(config && draftIsBad(config, draft))) advance()
        },
      })
    },
    [upsertMutation, advance, config],
  )

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLTextAreaElement || e.target instanceof HTMLInputElement) {
        if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) e.preventDefault()
        return
      }
      if (e.key === 'ArrowLeft') {
        e.preventDefault()
        setIndex((i) => Math.max(0, i - 1))
        setGoldenHighlight(false)
      } else if (e.key === 'ArrowRight') {
        e.preventDefault()
        advance()
      } else if (e.key === 'Escape') {
        onOpenChange(false)
      } else if (config?.dataType === 'boolean') {
        if (e.key === '1' || e.key.toLowerCase() === 'g') {
          e.preventDefault()
          saveAndAdvance({ value: 1, label: null, explanation: null })
        } else if (e.key === '0' || e.key.toLowerCase() === 'b') {
          e.preventDefault()
          saveAndAdvance({ value: 0, label: null, explanation: null })
        }
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, config, advance, saveAndAdvance, onOpenChange])

  if (!open || items.length === 0) return null

  const progress = items.length > 0 ? ((index + 1) / items.length) * 100 : 0

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        showCloseButton={false}
        className="flex h-[82vh] max-h-[680px] w-[92vw] max-w-4xl flex-col gap-0 overflow-hidden p-0 sm:max-w-4xl"
      >
        <div className="flex items-center justify-between gap-3 border-b px-4 py-3">
          <div className="min-w-0">
            <DialogTitle className="text-base">Review queue</DialogTitle>
            <DialogDescription className="truncate font-mono text-xs">
              {index + 1} / {items.length} · {item?.title}
            </DialogDescription>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <Select value={dimension ?? ''} onValueChange={setDimension}>
              <SelectTrigger size="sm" className="w-40">
                <SelectValue placeholder="Dimension…" />
              </SelectTrigger>
              <SelectContent>
                {activeConfigs.map((c) => (
                  <SelectItem key={c.id} value={c.name}>
                    {c.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button size="sm" variant="ghost" onClick={() => onOpenChange(false)}>
              <HugeiconsIcon icon={Cancel01Icon} strokeWidth={2} data-icon="inline-start" />
              Close
            </Button>
          </div>
        </div>

        <div className="px-4 pt-2">
          <Progress value={progress} className="h-1.5" />
          <p className="mt-1 text-[11px] text-muted-foreground">
            ←/→ navigate · {config?.dataType === 'boolean' ? '1/0 or G/B score · ' : ''}Esc close
          </p>
        </div>

        <div className="grid min-h-0 flex-1 grid-cols-1 gap-0 md:grid-cols-2">
          <div className="min-h-0 overflow-y-auto border-b p-4 md:border-r md:border-b-0">
            <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Trace</h3>
            {traceLoading ? (
              <Skeleton className="h-40 w-full" />
            ) : snapshot ? (
              <ReviewTracePreview spans={traceData!.spans} evalSpan={snapshot.span} />
            ) : item?.previewText ? (
              <p className="whitespace-pre-wrap text-sm text-foreground/90">{item.previewText}</p>
            ) : traceId ? (
              <p className="text-sm text-muted-foreground">No preview for this target.</p>
            ) : (
              <p className="text-sm text-muted-foreground">{item?.title}</p>
            )}
            {traceId && (
              <Link
                to="/traces"
                search={{ trace: traceId }}
                className="mt-3 inline-block text-xs text-primary underline-offset-4 hover:underline"
              >
                Open in inspector
              </Link>
            )}
          </div>

          <div className="min-h-0 space-y-4 overflow-y-auto p-4">
            <section>
              <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                Score · {dimension ?? '—'}
              </h3>
              {config ? (
                <ScoreInput
                  key={`${item?.targetId}-${dimension}`}
                  config={config}
                  initial={
                    myScore
                      ? { value: myScore.value, label: myScore.label, explanation: myScore.explanation }
                      : undefined
                  }
                  pending={upsertMutation.isPending}
                  onSubmit={saveAndAdvance}
                  onCancel={undefined}
                />
              ) : (
                <p className="text-xs text-muted-foreground">Define a score dimension first.</p>
              )}
            </section>

            {snapshot && (
              <GoldenCapturePanel
                input={snapshot.input}
                sourceTraceId={snapshot.span.traceId}
                sourceSpanId={snapshot.span.id}
                highlighted={goldenHighlight}
              />
            )}
          </div>
        </div>

        <div className="flex items-center justify-between gap-2 border-t px-4 py-2">
          <Button
            size="sm"
            variant="outline"
            disabled={index <= 0}
            onClick={() => {
              setIndex((i) => Math.max(0, i - 1))
              setGoldenHighlight(false)
            }}
          >
            <HugeiconsIcon icon={ArrowLeft01Icon} strokeWidth={2} data-icon="inline-start" />
            Previous
          </Button>
          <span className="text-xs text-muted-foreground tabular-nums">
            {index + 1} of {items.length}
          </span>
          <Button size="sm" variant="outline" disabled={index >= items.length - 1} onClick={advance}>
            Next
            <HugeiconsIcon icon={ArrowRight01Icon} strokeWidth={2} data-icon="inline-end" />
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}

function ReviewTracePreview({ spans, evalSpan }: { spans: Span[]; evalSpan: Span }) {
  const messages = asMessages(evalSpan.llmInput)
  const output = evalSpan.llmOutput

  return (
    <div className="space-y-3">
      {messages.length > 0 && (
        <div className="space-y-2">
          {messages.slice(-4).map((m, i) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: messages have no stable id, order is fixed
            <div key={`${m.role}-${i}`} className="rounded-md border bg-muted/20 px-2 py-1.5">
              <p className="text-[10px] font-medium uppercase text-muted-foreground">{m.role}</p>
              <p className="mt-0.5 whitespace-pre-wrap text-xs">
                {m.parts
                  .filter((p): p is { kind: 'text'; content: string } => p.kind === 'text')
                  .map((p) => p.content)
                  .join('\n')}
              </p>
            </div>
          ))}
        </div>
      )}
      {output != null && (
        <div>
          <p className="mb-1 text-[10px] font-medium uppercase text-muted-foreground">Output</p>
          <JsonView value={output} />
        </div>
      )}
      {messages.length === 0 && output == null && (
        <p className="text-xs text-muted-foreground">{spans.length} spans · no chat preview</p>
      )}
    </div>
  )
}
