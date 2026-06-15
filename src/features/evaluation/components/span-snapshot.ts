import { spanEvalSnapshot } from '#/features/evaluation/logic/span-eval-snapshot'
import type { JsonValue } from '#/lib/json'
import type { Span } from '#/lib/spans'
import { asMessages, messageText } from '#/lib/spans/conversation'

// Prefer the last chat span with output — the usual correction target.
function pickEvalSpan(spans: Span[]): Span | null {
  if (spans.length === 0) return null
  const withOutput = spans.filter((s) => s.llmOutput != null || s.toolResult != null)
  const chat = withOutput.filter((s) => s.operation === 'chat')
  const pool = chat.length > 0 ? chat : withOutput.length > 0 ? withOutput : spans
  return pool[pool.length - 1] ?? null
}

export function traceEvalSnapshot(
  spans: Span[],
  targetSpanId?: string | null,
): { span: Span; input: Record<string, JsonValue> } | null {
  const span = (targetSpanId != null ? spans.find((s) => s.id === targetSpanId) : null) ?? pickEvalSpan(spans)
  if (!span) return null
  return { span, input: spanEvalSnapshot(span) }
}

export function defaultExpectedFromSnapshot(input: Record<string, JsonValue>): JsonValue | null {
  if (input.llmOutput != null) {
    const text = asMessages(input.llmOutput)
      .map((m) => messageText(m.parts))
      .filter(Boolean)
      .join('\n')
      .trim()
    return text || input.llmOutput
  }
  if (input.toolResult != null) return input.toolResult
  return null
}
