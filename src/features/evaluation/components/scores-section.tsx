import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { SquarePen, Trash2 } from 'lucide-react'
import { useMemo, useState } from 'react'
import { toast } from 'sonner'
import { Button } from '#/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '#/components/ui/select'
import { Skeleton } from '#/components/ui/skeleton'
import { Tooltip, TooltipContent, TooltipTrigger } from '#/components/ui/tooltip'
import { deleteScore, listScoresForTarget, upsertHumanScore } from '#/features/evaluation/server/scores'
import { useUser } from '#/hooks/use-user'
import {
  type ConfigHint,
  latestScores,
  SCORE_SOURCE_ICON,
  SCORE_SOURCE_LABEL,
  SCORE_TONE_CLASS,
  type Score,
  type ScoreConfig,
  type ScoreTargetKind,
  scoreIsBad,
} from '#/lib/eval/evaluation'
import { errMessage } from '#/lib/format'
import { queryKeys } from '#/lib/query-keys'
import { ACCENT } from '#/lib/tone'
import { cn } from '#/lib/utils'
import { DimensionForm } from './dimension-create'
import { scoreConfigsQuery } from './queries'
import { ScoreInput } from './score-input'
import { ScoreValue } from './score-value'

type Props = {
  targetKind: ScoreTargetKind
  targetId: string
  parentTraceId?: string | null
  parentSessionId?: string | null
}

export function ScoresSection({ targetKind, targetId, parentTraceId, parentSessionId }: Props) {
  const user = useUser()
  const queryClient = useQueryClient()
  const [adding, setAdding] = useState<string | null>(null) // dimension name being added
  const [defining, setDefining] = useState(false)

  const { data: scores, isLoading } = useQuery({
    queryKey: queryKeys.scores.byTarget(targetKind, targetId),
    queryFn: () => listScoresForTarget({ data: { targetKind, targetId } }),
  })
  const { data: configs } = useQuery(scoreConfigsQuery)

  const invalidate = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: queryKeys.scores.byTarget(targetKind, targetId) }),
      // A span score rolls up into the trace AND session list badges, so refresh
      // every kind's summary map, not just this target's kind.
      queryClient.invalidateQueries({ queryKey: ['scores', 'summaries'] }),
      // The /evals hub distribution aggregates all scores — refresh it too.
      queryClient.invalidateQueries({ queryKey: ['scores', 'rollup'] }),
    ])
  }

  const upsertMutation = useMutation({
    mutationFn: (vars: {
      config: ScoreConfig
      value: number | null
      label: string | null
      explanation: string | null
    }) =>
      upsertHumanScore({
        data: {
          targetKind,
          targetId,
          parentTraceId,
          parentSessionId,
          name: vars.config.name,
          dataType: vars.config.dataType,
          value: vars.value,
          label: vars.label,
          explanation: vars.explanation,
          evaluator: user.name,
        },
      }),
    onSuccess: async () => {
      await invalidate()
      setAdding(null)
      toast.success('Score saved')
    },
    onError: (e) => toast.error(errMessage(e)),
  })

  const deleteMutation = useMutation({
    // Scope the delete to the current author — you can only delete your own row.
    mutationFn: (id: number) => deleteScore({ data: { id, evaluator: user.name } }),
    onSuccess: async () => {
      await invalidate()
      toast.success('Score deleted')
    },
  })

  const activeConfigs = useMemo(() => (configs ?? []).filter((c) => !c.archived), [configs])
  const configByName = useMemo(() => new Map((configs ?? []).map((c) => [c.name, c])), [configs])
  const latest = useMemo(() => latestScores(scores ?? []), [scores])
  const names = useMemo(() => [...new Set(latest.map((s) => s.name))], [latest])

  if (isLoading) return <Skeleton className="h-16 w-full" />

  const addConfig = adding ? configByName.get(adding) : undefined
  const myExisting = (name: string) =>
    latest.find((s) => s.name === name && s.evaluator === user.name && s.source === 'human')

  return (
    <div className="flex flex-col gap-3">
      {names.length > 0 && (
        <div className="flex flex-col gap-2">
          {names.map((name) => (
            <DimensionGroup
              key={name}
              name={name}
              scores={latest.filter((s) => s.name === name)}
              config={configByName.get(name)}
              currentUser={user.name}
              onEdit={(s) => setAdding(s.name)}
              onDelete={(id) => deleteMutation.mutate(id)}
            />
          ))}
        </div>
      )}

      {defining ? (
        <DimensionForm
          onCreated={(c) => {
            setDefining(false)
            setAdding(c.name)
          }}
          onCancel={() => setDefining(false)}
        />
      ) : adding && addConfig ? (
        <div className="rounded-lg border bg-card px-3 py-3">
          <div className="mb-2 text-xs font-medium text-muted-foreground">
            {myExisting(adding) ? 'Update' : 'Score'} <span className="text-foreground">{addConfig.name}</span>
          </div>
          <ScoreInput
            // Remount per dimension so draft state never leaks across a switch.
            key={addConfig.id}
            config={addConfig}
            initial={
              myExisting(adding)
                ? {
                    value: myExisting(adding)?.value ?? null,
                    label: myExisting(adding)?.label ?? null,
                    explanation: myExisting(adding)?.explanation ?? null,
                  }
                : undefined
            }
            pending={upsertMutation.isPending}
            onSubmit={(draft) => upsertMutation.mutate({ config: addConfig, ...draft })}
            onCancel={() => setAdding(null)}
          />
        </div>
      ) : (
        <div className="flex items-center gap-2">
          {activeConfigs.length > 0 ? (
            <Select value="" onValueChange={(name) => setAdding(name)}>
              <SelectTrigger size="sm" className="w-48 text-xs">
                <SelectValue placeholder="Add a score…" />
              </SelectTrigger>
              <SelectContent>
                {activeConfigs.map((c) => (
                  <SelectItem key={c.id} value={c.name}>
                    {c.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : (
            <span className="text-xs text-muted-foreground">No dimensions yet.</span>
          )}
          <Button size="sm" variant="ghost" onClick={() => setDefining(true)}>
            + New dimension
          </Button>
        </div>
      )}
    </div>
  )
}

function DimensionGroup({
  name,
  scores,
  config,
  currentUser,
  onEdit,
  onDelete,
}: {
  name: string
  scores: Score[]
  config?: ScoreConfig
  currentUser: string
  onEdit: (s: Score) => void
  onDelete: (id: number) => void
}) {
  // Full config so categorical pass/fail sets and numeric direction apply, not just the range.
  const scale: ConfigHint | undefined = config ?? undefined
  const human = scores.find((s) => s.source === 'human')
  const judge = scores.find((s) => s.source === 'llm')
  const disagreement = human && judge && scoreIsBad(human, scale) !== scoreIsBad(judge, scale)

  return (
    <div className="rounded-lg border bg-card px-3 py-2">
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-medium text-foreground">{name}</span>
        {disagreement && (
          <span className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${ACCENT.amber.badge}`}>disagreement</span>
        )}
      </div>
      <div className="mt-1.5 flex flex-col gap-1">
        {scores.map((s) => (
          <ScoreRow
            key={s.id}
            score={s}
            scale={scale}
            editable={s.source === 'human' && s.evaluator === currentUser}
            onEdit={onEdit}
            onDelete={onDelete}
          />
        ))}
      </div>
    </div>
  )
}

function ScoreRow({
  score,
  scale,
  editable,
  onEdit,
  onDelete,
}: {
  score: Score
  scale?: ConfigHint
  editable: boolean
  onEdit: (s: Score) => void
  onDelete: (id: number) => void
}) {
  const tone = scoreIsBad(score, scale) ? 'bad' : 'good'
  return (
    <div className="flex items-center gap-2 text-xs">
      <span title={SCORE_SOURCE_LABEL[score.source]}>
        <span aria-hidden>{SCORE_SOURCE_ICON[score.source]}</span>
        <span className="sr-only">{SCORE_SOURCE_LABEL[score.source]}</span>
      </span>
      <ScoreValue score={score} scale={scale} className={cn('font-medium tabular-nums', SCORE_TONE_CLASS[tone])} />
      <span className="truncate text-muted-foreground">{score.evaluator}</span>
      {score.explanation && (
        <Tooltip>
          <TooltipTrigger asChild>
            <span className="min-w-0 flex-1 truncate text-muted-foreground/80 italic">{score.explanation}</span>
          </TooltipTrigger>
          <TooltipContent className="max-w-xs">{score.explanation}</TooltipContent>
        </Tooltip>
      )}
      {editable && (
        <div className="ml-auto flex items-center gap-0.5">
          <Button size="icon-sm" variant="ghost" aria-label="Edit score" onClick={() => onEdit(score)}>
            <SquarePen />
          </Button>
          <Button
            size="icon-sm"
            variant="ghost"
            aria-label="Delete score"
            className="text-muted-foreground hover:text-destructive"
            onClick={() => onDelete(score.id)}
          >
            <Trash2 />
          </Button>
        </div>
      )}
    </div>
  )
}
