import { and, eq, inArray, isNull } from 'drizzle-orm'
import { db } from '#/db'
import { evalDefinitions, scores } from '#/db/schema'
import type { TraceSummary } from '#/lib/telemetry'
import { listRecentTraces } from '#/lib/telemetry'
import { casesFromTraces } from './eval-jobs'
import { resolveJudgeDefaults, runJudgeSamples } from './judge'
import { type LiveFilter, matchesLiveFilter, parseLiveFilter, sampleRateOf } from './online-eval-filter'

export type OnlineEvalResult = { evaluators: number; scored: number }

const DEFAULT_TRACE_LIMIT = 15
const DEFAULT_MAX_JUDGE_CALLS = 20

export async function runOnlineEvals(
  opts: { limit?: number; maxJudgeCalls?: number; rand?: () => number } = {},
): Promise<OnlineEvalResult> {
  const { configured } = resolveJudgeDefaults()
  if (!configured) return { evaluators: 0, scored: 0 }

  const defs = await db
    .select()
    .from(evalDefinitions)
    .where(and(eq(evalDefinitions.mode, 'online'), eq(evalDefinitions.source, 'llm')))
  if (defs.length === 0) return { evaluators: 0, scored: 0 }

  // Push a pinned service/agent into the query so it isn't crowded out; unpinned defs share one pool.
  const limit = opts.limit ?? DEFAULT_TRACE_LIMIT
  let sharedPool: TraceSummary[] | undefined
  const poolFor = async (filter: LiveFilter): Promise<TraceSummary[]> => {
    if (filter?.serviceName || filter?.agentName) {
      const r = await listRecentTraces({
        limit,
        ...(filter.serviceName ? { serviceName: filter.serviceName } : {}),
        ...(filter.agentName ? { agentName: filter.agentName } : {}),
      })
      return r?.traces ?? []
    }
    if (!sharedPool) sharedPool = (await listRecentTraces({ limit }))?.traces ?? []
    return sharedPool
  }

  const defIds = defs.map((d) => d.id)
  const existing = await db
    .select({ definitionId: scores.definitionId, parentTraceId: scores.parentTraceId, targetId: scores.targetId })
    .from(scores)
    .where(and(inArray(scores.definitionId, defIds), isNull(scores.runId)))
  const seen = new Set<string>()
  for (const s of existing) seen.add(`${s.definitionId}:${s.parentTraceId ?? s.targetId}`)

  const rand = opts.rand ?? Math.random
  const maxCalls = opts.maxJudgeCalls ?? DEFAULT_MAX_JUDGE_CALLS
  let scored = 0

  for (const def of defs) {
    if (scored >= maxCalls) break
    const filter = parseLiveFilter(def.liveFilter)
    const rate = sampleRateOf(filter)
    const traces = await poolFor(filter)
    for (const trace of traces) {
      if (scored >= maxCalls) break
      const key = `${def.id}:${trace.id}`
      if (seen.has(key)) continue
      if (!matchesLiveFilter(trace, filter)) continue
      if (rate < 1 && rand() > rate) continue
      seen.add(key)

      const cases = await casesFromTraces([trace.id], def.scope)
      if (cases.length === 0) continue
      for (const c of cases) {
        if (scored >= maxCalls) break
        const verdict = await runJudgeSamples(
          {
            model: def.model,
            judgePrompt: def.judgePrompt,
            dataType: def.dataType,
            fields: c.fields,
            expected: c.expected ?? null,
          },
          1,
        )
        await db
          .insert(scores)
          .values({
            targetKind: c.targetKind,
            targetId: c.targetId,
            parentTraceId: c.parentTraceId ?? null,
            parentSessionId: c.parentSessionId ?? null,
            sessionSource: c.sessionSource ?? null,
            name: def.name,
            dataType: def.dataType,
            value: verdict.value,
            label: verdict.label,
            explanation: verdict.explanation,
            source: 'llm',
            evaluator: `judge:${def.model}`,
            evaluatorVersion: def.version,
            errorType: verdict.errorType,
            definitionId: def.id,
            metadata: {
              online: true,
              costUsd: verdict.costUsd,
              samples: verdict.samples,
              variance: verdict.variance,
              perSample: verdict.perSample,
              inputTokens: verdict.inputTokens,
              outputTokens: verdict.outputTokens,
              raw: verdict.raw.slice(0, 2000),
            },
            createdAt: new Date(),
          })
          .onConflictDoNothing()
        scored += 1
      }
    }
  }

  return { evaluators: defs.length, scored }
}
