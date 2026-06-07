// Server-only eval helpers (plain functions, not createServerFn). Kept out of
// src/server/evals.ts so that file stays fully strippable: a module a client route
// imports must export only server fns + types, else its `import { db }` runs in the
// browser and crashes. Nothing here is imported into client code.

import { and, eq, lt, or } from 'drizzle-orm'
import { db } from '#/db'
import { evalRuns } from '#/db/schema'
import type { ScoreTargetKind } from '#/lib/eval/evaluation'
import { spanEvalSnapshot, type ToolCall, toolCallsFromSpans } from '#/lib/eval/span-eval-snapshot'
import type { JsonValue } from '#/lib/json'
import type { Span } from '#/lib/spans'
import { getTrace } from '#/lib/telemetry'
import type { JudgeCaseFields } from './judge'

export const STUCK_EVAL_RUN_MS = 2 * 60 * 60 * 1000

export type JudgeCaseInput = {
  targetKind: ScoreTargetKind
  targetId: string
  parentTraceId?: string | null
  parentSessionId?: string | null
  sessionSource?: 'attribute' | 'trace' | null
  datasetRunItemId?: number | null
  fields: JudgeCaseFields
  expected?: JsonValue | null
}

function isScorableSpan(span: Span): boolean {
  return span.llmInput != null || span.llmOutput != null
}

// scope=span → one case per chat span; scope=trace/session → one per trace (its
// final chat span), targetId = the trace id.
export async function casesFromTraces(traceIds: string[], scope: ScoreTargetKind): Promise<JudgeCaseInput[]> {
  const cases: JudgeCaseInput[] = []
  for (const traceId of traceIds) {
    const trace = await getTrace(traceId)
    if (!trace) continue
    const scorable = trace.spans.filter(isScorableSpan)
    if (scorable.length === 0) continue
    if (scope === 'span') {
      for (const span of scorable) {
        cases.push({
          targetKind: 'span',
          targetId: span.id,
          parentTraceId: traceId,
          parentSessionId: span.sessionId ?? null,
          sessionSource: span.sessionSource ?? null,
          fields: spanEvalSnapshot(span),
        })
      }
    } else {
      const span = scorable[scorable.length - 1]
      cases.push({
        targetKind: scope,
        targetId: traceId,
        parentTraceId: traceId,
        parentSessionId: span.sessionId ?? null,
        sessionSource: scope === 'session' ? (span.sessionSource ?? 'trace') : null,
        fields: spanEvalSnapshot(span),
      })
    }
  }
  return cases
}

// Tool calls in a trace; null (not []) when it can't be fetched, so callers retry.
export async function toolCallsFromTrace(traceId: string): Promise<ToolCall[] | null> {
  try {
    const trace = await getTrace(traceId)
    if (!trace) return null
    return toolCallsFromSpans(trace.spans)
  } catch {
    return null
  }
}

// Reap runs stuck 'pending'/'running' past the threshold (crashed background job)
// to 'error' so the UI stops polling them. Runs on the home loader.
export async function recoverStuckEvalRuns(maxAgeMs = STUCK_EVAL_RUN_MS): Promise<number> {
  const cutoff = new Date(Date.now() - maxAgeMs)
  const stuck = await db
    .select({ id: evalRuns.id })
    .from(evalRuns)
    .where(and(or(eq(evalRuns.status, 'pending'), eq(evalRuns.status, 'running')), lt(evalRuns.createdAt, cutoff)))
  if (stuck.length === 0) return 0
  const now = new Date()
  for (const row of stuck) {
    await db.update(evalRuns).set({ status: 'error', endedAt: now }).where(eq(evalRuns.id, row.id))
  }
  return stuck.length
}
