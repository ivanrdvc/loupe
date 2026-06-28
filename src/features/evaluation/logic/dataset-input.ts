import type { ExampleInput } from '#/features/evaluation/dataset-types'
import type { JsonValue } from '#/lib/json'
import type { Span } from '#/lib/spans'
import { asMessages, messageText } from '#/lib/spans/conversation'
import { spanEvalSnapshot } from './span-eval-snapshot'

const asInput = (v: JsonValue): ExampleInput => (typeof v === 'string' ? v : JSON.stringify(v))

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

// Question-only payload (a dataset example input) from a span eval snapshot.
export function datasetInputFromSnapshot(snapshot: Record<string, JsonValue>): ExampleInput {
  if (snapshot.llmInput == null) return ''
  const parsed = asMessages(snapshot.llmInput)
  if (parsed.length === 0) return asInput(snapshot.llmInput) // plain string / non-message JSON
  // Drop the system turn — the eval-time agent supplies its own.
  const msgs = parsed
    .map((m) => ({ role: m.role, content: messageText(m.parts) }))
    .filter((m) => m.content && m.role !== 'system')
  if (msgs.length === 1 && msgs[0].role === 'user') return msgs[0].content
  if (msgs.length > 0) return msgs
  return ''
}
