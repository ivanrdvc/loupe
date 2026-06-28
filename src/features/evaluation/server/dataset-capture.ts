import { getSession, getTrace } from '#/lib/telemetry'
import type { ExampleInput } from '../dataset-types'
import { datasetInputFromSnapshot, defaultExpectedFromSnapshot, traceEvalSnapshot } from '../logic/dataset-input'

export interface CapturedExample {
  input: ExampleInput
  defaultExpected: string | null
  sourceTraceId: string
  sourceSpanId: string
  sourceAgent: string | null
}

function dominantAgent(spans: { agentName?: string | null }[]): string | null {
  const counts: Record<string, number> = {}
  for (const s of spans) if (s.agentName) counts[s.agentName] = (counts[s.agentName] ?? 0) + 1
  const top = Object.entries(counts).sort((a, b) => b[1] - a[1])[0]
  return top?.[0] ?? null
}

// Build a dataset example from a trace, reusing the same extraction the Add-to-dataset
// dialog uses: the question becomes the input, the observed output a draft golden. Null
// when the trace has no usable span.
export async function exampleFromTrace(traceId: string, spanId?: string | null): Promise<CapturedExample | null> {
  const res = await getTrace(traceId)
  if (!res?.spans.length) return null
  const snap = traceEvalSnapshot(res.spans, spanId)
  if (!snap) return null
  const expected = defaultExpectedFromSnapshot(snap.input)
  return {
    input: datasetInputFromSnapshot(snap.input),
    defaultExpected: expected == null ? null : typeof expected === 'string' ? expected : JSON.stringify(expected),
    sourceTraceId: traceId,
    sourceSpanId: snap.span.id,
    sourceAgent: dominantAgent(res.spans),
  }
}

// A session is many traces; capture one example per trace in it.
export async function examplesFromSession(sessionId: string): Promise<CapturedExample[]> {
  const res = await getSession(sessionId)
  if (!res?.traceIds?.length) return []
  const caps = await Promise.all(res.traceIds.map((t) => exampleFromTrace(t)))
  return caps.filter((c): c is CapturedExample => c != null)
}
