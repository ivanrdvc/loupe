import type { JsonValue } from '#/lib/json'
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
  if (snapshot.llmInput != null) return asInput(snapshot.llmInput)
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
