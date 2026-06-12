import { queryOptions } from '@tanstack/react-query'
import { getEvalDefinition, getJudgeDefaults, listEvalDefinitions } from '#/features/evaluation/server/evals'
import { listScoreConfigs, listScoreSummaries } from '#/features/evaluation/server/scores'
import type { ScoreTargetKind } from '#/lib/eval/evaluation'
import { queryKeys, STALE_LIVE_MS, STALE_TELEMETRY_MS } from '#/lib/query-keys'

// id → aggregate ScoreSummary for the trace/session list badge column + score filter.
export const scoreSummariesQuery = (kind: ScoreTargetKind) =>
  queryOptions({
    queryKey: queryKeys.scores.summariesForKind(kind),
    queryFn: () => listScoreSummaries({ data: { kind } }),
    staleTime: STALE_LIVE_MS,
  })

// Dimension registry. Dimension-create invalidates this key, so the short
// staleTime is safe everywhere it's read.
export const scoreConfigsQuery = queryOptions({
  queryKey: queryKeys.scores.configs(),
  queryFn: () => listScoreConfigs(),
  staleTime: STALE_LIVE_MS,
})

export const judgeDefaultsQuery = queryOptions({
  queryKey: queryKeys.evals.judgeDefaults(),
  queryFn: () => getJudgeDefaults(),
  staleTime: STALE_TELEMETRY_MS,
})

export const definitionsQuery = queryOptions({
  queryKey: queryKeys.evals.definitions(),
  queryFn: () => listEvalDefinitions({ data: {} }),
  staleTime: STALE_TELEMETRY_MS,
})

export const definitionQuery = (id: number) =>
  queryOptions({
    queryKey: queryKeys.evals.definition(id),
    queryFn: () => getEvalDefinition({ data: id }),
    staleTime: STALE_LIVE_MS,
  })
