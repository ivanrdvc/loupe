import type { ExampleInput } from '#/features/evaluation/dataset-types'
import type { JsonValue } from '#/lib/json'
import { asMessages, messageText } from '#/lib/spans/conversation'

const asInput = (v: JsonValue): ExampleInput => (typeof v === 'string' ? v : JSON.stringify(v))

// Question-only payload (a dataset example input) from a span eval snapshot.
export function datasetInputFromSnapshot(snapshot: Record<string, JsonValue>): ExampleInput {
  if (snapshot.llmInput != null) {
    // Drop the system turn — the eval-time agent supplies its own. A lone user turn collapses to a plain string.
    const msgs = asMessages(snapshot.llmInput)
      .map((m) => ({ role: m.role, content: messageText(m.parts) }))
      .filter((m) => m.content && m.role !== 'system')
    if (msgs.length === 1 && msgs[0].role === 'user') return msgs[0].content
    if (msgs.length > 0) return msgs
    return asInput(snapshot.llmInput)
  }
  return ''
}
