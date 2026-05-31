import type { JsonValue } from '#/lib/json'
import { spanEvalSnapshot } from '#/lib/eval/span-eval-snapshot'
import type { Span } from '#/lib/spans'

// Prefer the last chat span with output — the usual correction target.
function pickEvalSpan(spans: Span[]): Span | null {
  if (spans.length === 0) return null
  const withOutput = spans.filter((s) => s.llmOutput != null || s.toolResult != null)
  const chat = withOutput.filter((s) => s.operation === 'chat')
  const pool = chat.length > 0 ? chat : withOutput.length > 0 ? withOutput : spans
  return pool[pool.length - 1] ?? null
}

export function traceEvalSnapshot(spans: Span[]): { span: Span; input: Record<string, JsonValue> } | null {
  const span = pickEvalSpan(spans)
  if (!span) return null
  return { span, input: spanEvalSnapshot(span) }
}

export function defaultExpectedFromSnapshot(input: Record<string, JsonValue>): JsonValue | null {
  if (input.llmOutput != null) return input.llmOutput
  if (input.toolResult != null) return input.toolResult
  return null
}

export function prettyJson(value: JsonValue): string {
  return typeof value === 'string' ? value : JSON.stringify(value, null, 2)
}
