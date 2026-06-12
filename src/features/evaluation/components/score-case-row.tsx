import { useQuery } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { useMemo } from 'react'
import { RelativeTime } from '#/components/relative-time'
import { Badge } from '#/components/ui/badge'
import { TableCell, TableRow } from '#/components/ui/table'
import { Tooltip, TooltipContent, TooltipTrigger } from '#/components/ui/tooltip'
import { scoreConfigsQuery } from '#/features/evaluation/components/queries'
import { ScoreValue } from '#/features/evaluation/components/score-value'
import { type ConfigHint, configToHint, SCORE_TONE_CLASS, type Score, scoreIsBad } from '#/lib/eval/evaluation'
import { cn } from '#/lib/utils'

// Only a synthetic dataset item with no backing trace is non-linkable; items
// sourced from real traces/spans keep their real id and stay linkable.
function isDatasetItemScore(score: Score): boolean {
  return score.datasetRunItemId != null && score.parentTraceId == null && score.targetId.startsWith('item:')
}

// Per-dimension polarity/scale, so verdicts classify against their config
// (not the lexicon/unscaled fallback).
export function useScaleMap(): Map<string, ConfigHint> {
  const { data: configs = [] } = useQuery(scoreConfigsQuery)
  return useMemo(() => new Map(configs.map((c) => [c.name, configToHint(c)])), [configs])
}

export function ScoreCaseRow({ score, scale, showError }: { score: Score; scale?: ConfigHint; showError?: boolean }) {
  const bad = scoreIsBad(score, scale)
  const traceTarget = score.parentTraceId ?? score.targetId

  return (
    <TableRow className="[&>:first-child]:pl-4 [&>:last-child]:pr-4 lg:[&>:first-child]:pl-6 lg:[&>:last-child]:pr-6">
      <TableCell>
        <span className="flex items-center gap-2">
          <Badge variant="outline" className="capitalize">
            {score.targetKind}
          </Badge>
          {isDatasetItemScore(score) ? (
            <span className="max-w-[16rem] truncate font-mono text-xs text-muted-foreground" title={score.targetId}>
              {score.targetId}
            </span>
          ) : (
            <Link
              to="/traces"
              search={{ trace: traceTarget }}
              className="max-w-[16rem] truncate font-mono text-xs text-primary underline-offset-4 hover:underline"
              title={score.targetId}
            >
              {score.targetId}
            </Link>
          )}
        </span>
      </TableCell>
      <TableCell>
        <ScoreValue
          score={score}
          scale={scale}
          className={cn('font-medium', bad ? SCORE_TONE_CLASS.bad : SCORE_TONE_CLASS.good)}
        />
      </TableCell>
      <TableCell className="max-w-[28rem]">
        {score.explanation ? (
          <Tooltip>
            <TooltipTrigger asChild>
              <span className="block truncate text-xs text-muted-foreground">{score.explanation}</span>
            </TooltipTrigger>
            <TooltipContent side="bottom" className="max-w-md whitespace-pre-wrap">
              {score.explanation}
            </TooltipContent>
          </Tooltip>
        ) : (
          <span className="text-xs text-muted-foreground">—</span>
        )}
      </TableCell>
      {showError && (
        <TableCell>
          {score.errorType ? (
            <Badge variant="destructive" className="font-mono text-[11px]">
              {score.errorType}
            </Badge>
          ) : (
            <span className="text-xs text-muted-foreground">—</span>
          )}
        </TableCell>
      )}
      <TableCell className="text-right">
        <RelativeTime ts={score.createdAt} className="text-xs text-muted-foreground tabular-nums" />
      </TableCell>
    </TableRow>
  )
}
