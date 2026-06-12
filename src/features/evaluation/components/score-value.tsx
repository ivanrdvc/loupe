import { ThumbsDown, ThumbsUp } from 'lucide-react'
import { type ConfigHint, formatScoreValue, type ScoreValueShape } from '#/lib/eval/evaluation'
import { cn } from '#/lib/utils'

const THUMB_CLASS = 'size-3.5 shrink-0'

export function ThumbUpIcon({ className }: { className?: string }) {
  return <ThumbsUp className={cn(THUMB_CLASS, className)} />
}

export function ThumbDownIcon({ className }: { className?: string }) {
  return <ThumbsDown className={cn(THUMB_CLASS, className)} />
}

export function ScoreValue({
  score,
  scale,
  className,
}: {
  score: ScoreValueShape
  scale?: ConfigHint
  className?: string
}) {
  if (score.dataType === 'boolean') {
    if (score.value == null) return <span className={className}>—</span>
    const label = score.value === 1 ? 'Good' : 'Bad'
    const Icon = score.value === 1 ? ThumbUpIcon : ThumbDownIcon
    return (
      <span className={cn('inline-flex', className)} role="img" aria-label={label}>
        <Icon />
      </span>
    )
  }
  return <span className={className}>{formatScoreValue(score, scale)}</span>
}
