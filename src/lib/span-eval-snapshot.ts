import type { JsonValue } from '#/lib/json'
import type { Span } from '#/lib/spans'

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
