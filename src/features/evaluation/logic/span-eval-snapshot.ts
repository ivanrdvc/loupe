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

export type ToolCall = { name: string; args?: JsonValue; result?: JsonValue }

// Tool calls across a trace in execution order, one per tool/MCP span — the
// trace-level analog of the per-span tool fields the live judge reads.
export function toolCallsFromSpans(spans: Span[]): ToolCall[] {
  return spans
    .filter((s) => (s.operation === 'tool' || s.operation === 'mcp') && s.toolName)
    .sort((a, b) => a.startMs - b.startMs)
    .map((s) => {
      const call: ToolCall = { name: s.toolName as string }
      const args = parseToolArgs(s.inputParams)
      if (args !== undefined) call.args = args
      if (s.toolResult != null) call.result = s.toolResult
      return call
    })
}

function parseToolArgs(raw: string | undefined): JsonValue | undefined {
  if (raw == null || raw.trim() === '') return undefined
  try {
    return JSON.parse(raw) as JsonValue
  } catch {
    return raw
  }
}
