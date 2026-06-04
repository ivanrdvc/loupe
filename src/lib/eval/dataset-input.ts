import type { JsonValue } from '#/lib/json'
import { asMessages, messageText } from '#/lib/spans/conversation'
import type { ExampleInput } from '#/routes/datasets/-types'

const SPAN_OUTPUT_FIELD_KEYS = new Set([
  'llmOutput',
  'toolResult',
  'toolDefinitions',
  'toolName',
  'inputParams',
  'agentName',
  'systemInstructions',
])

const asInput = (v: JsonValue): ExampleInput => (typeof v === 'string' ? v : JSON.stringify(v))

// Question-only payload (a dataset example input) from a span eval snapshot.
export function datasetInputFromSnapshot(snapshot: Record<string, JsonValue>): ExampleInput {
  if (snapshot.llmInput != null) {
    // A lone user turn collapses to a plain string.
    const msgs = asMessages(snapshot.llmInput)
      .map((m) => ({ role: m.role, content: messageText(m.parts) }))
      .filter((m) => m.content)
    if (msgs.length === 1 && msgs[0].role === 'user') return msgs[0].content
    if (msgs.length > 0) return msgs
    return asInput(snapshot.llmInput)
  }
  for (const key of ['input', 'question', 'prompt', 'userMessage']) {
    const v = snapshot[key]
    if (v != null) return asInput(v)
  }
  const rest: Record<string, JsonValue> = {}
  for (const [k, v] of Object.entries(snapshot)) {
    if (!SPAN_OUTPUT_FIELD_KEYS.has(k) && v != null) rest[k] = v
  }
  const keys = Object.keys(rest)
  if (keys.length === 1) return asInput(rest[keys[0]])
  if (keys.length > 0) return JSON.stringify(rest)
  return ''
}
