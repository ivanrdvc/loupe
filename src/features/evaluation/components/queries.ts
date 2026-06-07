import { queryOptions } from '@tanstack/react-query'
import { listScoreSummaries } from '#/features/evaluation/server/scores'
import type { ScoreTargetKind } from '#/lib/eval/evaluation'
import { queryKeys, STALE_LIVE_MS } from '#/lib/query-keys'

// id → aggregate ScoreSummary for the trace/session list badge column + score filter.
export const scoreSummariesQuery = (kind: ScoreTargetKind) =>
  queryOptions({
    queryKey: queryKeys.scores.summariesForKind(kind),
    queryFn: () => listScoreSummaries({ data: { kind } }),
    staleTime: STALE_LIVE_MS,
  })
