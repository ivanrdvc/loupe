import type { JsonValue } from '#/lib/json'
import type { Span } from '#/lib/spans'

// Eval-relevant normalized Span fields for judges and golden capture.
export function spanEvalSnapshot(span: Span): Record<string, JsonValue> {
  const out: Record<string, JsonValue> = {}
  const put = (key: string, value: JsonValue | string | undefined | null) => {
    if (value == null) return
    if (typeof value === 'string' && value.trim() === '') return
    out[key] = value
  }
  put('llmInput', span.llmInput)
  put('toolDefinitions', span.toolDefinitions)
  put('toolName', span.toolName)
  put('inputParams', span.inputParams)
  put('toolResult', span.toolResult)
  put('llmOutput', span.llmOutput)
  put('agentName', span.agentName)
  put('systemInstructions', span.systemInstructions)
  return out
}

// Prefer the last chat span with output — the usual correction target.
export function pickEvalSpan(spans: Span[]): Span | null {
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
