import { ScoreValue } from '#/components/scores/score-value'
import { Badge } from '#/components/ui/badge'
import { Tooltip, TooltipContent, TooltipTrigger } from '#/components/ui/tooltip'
import { SCORE_TONE_CLASS, type ScoreSummary } from '#/lib/eval/evaluation'
import { cn } from '#/lib/utils'

// Aggregate badge for the trace/session lists: a single score shows its raw value,
// multiple show an average (Ø) or count, colored by tone. ⚡ marks human↔judge disagreement.
export function ScoreSummaryBadge({ summary, className }: { summary: ScoreSummary; className?: string }) {
  const text = summaryContent(summary)
  const tip =
    summary.names.length > 0
      ? `${summary.count} score${summary.count === 1 ? '' : 's'} · ${summary.names.join(', ')}`
      : `${summary.count} scores`
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Badge variant="outline" className={cn('gap-1 tabular-nums', SCORE_TONE_CLASS[summary.tone], className)}>
          {text}
          {summary.disagreement && (
            <span role="img" aria-label="human and judge disagree">
              ⚡
            </span>
          )}
        </Badge>
      </TooltipTrigger>
      <TooltipContent>{tip}</TooltipContent>
    </Tooltip>
  )
}

function summaryContent(summary: ScoreSummary) {
  if (summary.single) return <ScoreValue score={summary.single} />
  if (summary.avg != null) return <>Ø {Math.round(summary.avg * 100)}%</>
  return <>{summary.count}×</>
}
