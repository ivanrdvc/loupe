import { classifySpan } from '#/lib/classify-span'
import type { Span, SpanKind } from '#/lib/spans'

// Shape we accept at the boundary. Loose on purpose — matches what OTel
// collectors and OpenObserve actually serialize (see docs/reference/ai-attributes.md).
// Times in nanoseconds; we normalize to ms. Attribute keys may use either
// dotted (`gen_ai.request.model`) or flattened (`gen_ai_request_model`) form.
export interface RawSpan {
  span_id: string
  trace_id: string
  reference_parent_span_id?: string | null
  name: string
  start_time: number
  end_time: number
  span_kind?: number
  span_status?: string
  service_name?: string
  attributes?: Record<string, unknown>
}

const KIND_BY_NUMBER: Record<number, SpanKind> = {
  1: 'internal',
  2: 'server',
  3: 'client',
  4: 'producer',
  5: 'consumer',
}

export function ingestSpans(raw: RawSpan[]): Span[] {
  return raw.map(normalize)
}

function normalize(r: RawSpan): Span {
  const startMs = Math.floor(r.start_time / 1_000_000)
  const endMs = Math.floor(r.end_time / 1_000_000)
  return {
    id: r.span_id,
    traceId: r.trace_id,
    parentId: r.reference_parent_span_id || null,
    service: r.service_name ?? 'unknown',
    kind: KIND_BY_NUMBER[r.span_kind ?? 1] ?? 'internal',
    name: r.name,
    startMs,
    endMs,
    ...(r.span_status === 'ERROR' ? { hasError: true } : {}),
    ...classifySpan(r.name, r.attributes ?? {}, startMs),
  }
}
