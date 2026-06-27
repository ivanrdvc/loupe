import type { ConversationEvent } from '#/lib/spans/conversation'
import { buildConversation } from '#/lib/spans/conversation'
import { getTrace } from '#/lib/telemetry'
import { clampIO, type Detail, notFound, pageMeta, readDetail, readPage, respond } from '../logic/respond'
import { aggregate, spanTree } from '../logic/shape'

/** One trace as the classified span tree loupe built + summed aggregates. */
export async function traceResponse(traceId: string, url: URL): Promise<Response> {
  const detail = readDetail(url)
  const r = await getTrace(traceId)
  if (!r || r.spans.length === 0) return notFound(`Trace ${traceId}`)
  const agg = aggregate(r.spans)
  return respond(
    {
      trace_id: traceId,
      provider: r.provider,
      truncated: r.truncated,
      aggregates: agg,
      spans: spanTree(r.spans, detail),
    },
    detail,
    `trace-${traceId}`,
    { aggregates: agg },
  )
}

/** Clamp the heavy I/O carried on each event; errors pass through whole. */
function clampEvent(e: ConversationEvent, detail: Detail): ConversationEvent {
  switch (e.kind) {
    case 'message':
      return { ...e, content: (clampIO(e.content, detail) as string) ?? '' }
    case 'tool_call':
      return { ...e, arguments: clampIO(e.arguments, detail) ?? null }
    case 'tool_result':
      return { ...e, result: clampIO(e.result, detail) ?? null }
    case 'agent_call':
      return { ...e, input: clampIO(e.input, detail) ?? null, result: clampIO(e.result, detail) ?? null }
  }
}

/** The reconstructed conversation events, paged so a long run can't overflow. */
export async function conversationResponse(traceId: string, url: URL): Promise<Response> {
  const detail = readDetail(url)
  const { limit, offset } = readPage(url.searchParams, 100, 500)
  const r = await getTrace(traceId)
  if (!r || r.spans.length === 0) return notFound(`Trace ${traceId}`)
  const events = buildConversation(r.spans)
  const page = events.slice(offset, offset + limit).map((e) => clampEvent(e, detail))
  return respond(
    { trace_id: traceId, provider: r.provider, page: pageMeta(events.length, limit, offset), events: page },
    detail,
    `conversation-${traceId}`,
    { count: events.length },
  )
}

/** A single span, full untruncated I/O — trace-scoped (no provider getSpan). */
export async function spanResponse(traceId: string, spanId: string, url: URL): Promise<Response> {
  const detail = readDetail(url)
  const r = await getTrace(traceId)
  if (!r) return notFound(`Trace ${traceId}`)
  const span = r.spans.find((s) => s.id === spanId)
  if (!span) return notFound(`Span ${spanId} in trace ${traceId}`)
  const { rawAttributes, truncatedAttrs, ...rest } = span
  const out = detail === 'raw' ? { ...rest, rawAttributes, truncatedAttrs } : rest
  return respond({ trace_id: traceId, provider: r.provider, span: out }, detail, `span-${spanId}`, {
    name: span.name,
    operation: span.operation,
  })
}
