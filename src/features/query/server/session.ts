import type { Span } from '#/lib/spans'
import { getSession } from '#/lib/telemetry'
import { notFound, readDetail, respond } from '../logic/respond'
import { aggregate, spanTree } from '../logic/shape'

/** Session spine: trace_ids + per-trace and overall aggregates. */
export async function sessionResponse(sessionId: string, url: URL): Promise<Response> {
  const detail = readDetail(url)
  const r = await getSession(sessionId)
  if (!r || r.spans.length === 0) return notFound(`Session ${sessionId}`)

  const byTrace = new Map<string, Span[]>()
  for (const s of r.spans) {
    const list = byTrace.get(s.traceId)
    if (list) list.push(s)
    else byTrace.set(s.traceId, [s])
  }

  // Only traces that actually carry spans (a listed id with none would
  // aggregate to an epoch/zero row). Per-trace order follows traceIds.
  const traces = r.traceIds
    .filter((id) => byTrace.has(id))
    .map((id) => ({ id, aggregates: aggregate(byTrace.get(id) ?? []) }))

  // Session duration is active compute time (sum of per-trace durations), not
  // wall-clock across idle gaps between turns — matches SessionSummary.
  const activeMs = traces.reduce((a, t) => a + t.aggregates.duration_ms, 0)

  return respond(
    {
      session_id: r.sessionId,
      title: r.title,
      source: r.source,
      provider: r.provider,
      trace_ids: r.traceIds,
      aggregates: { ...aggregate(r.spans), duration_ms: activeMs },
      traces,
      ...(detail === 'full' ? { spans: spanTree(r.spans, detail) } : {}),
    },
    detail,
    `session-${sessionId}`,
    { trace_count: traces.length, span_count: r.spans.length },
  )
}
