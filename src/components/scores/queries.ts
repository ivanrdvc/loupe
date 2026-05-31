import { queryOptions } from '@tanstack/react-query'
import type { ScoreTargetKind } from '#/lib/eval/evaluation'
import { queryKeys, STALE_LIVE_MS } from '#/lib/query-keys'
import { listScoreSummaries } from '#/server/scores'

// id → aggregate ScoreSummary for the trace/session list badge column + score filter.
export const scoreSummariesQuery = (kind: ScoreTargetKind) =>
  queryOptions({
    queryKey: queryKeys.scores.summariesForKind(kind),
    queryFn: () => listScoreSummaries({ data: { kind } }),
    staleTime: STALE_LIVE_MS,
  })
