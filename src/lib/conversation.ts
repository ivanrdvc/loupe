import { type JsonValue, parseJson } from './json'
import { findUtilityChatIds, findWrappedAgent, type Span } from './spans'

// Discriminated union for the conversation view. Each renderer pattern-
// matches on `kind`; adding a new event type is one new arm. We deliberately
// don't extend Span with optional message/tool fields — every renderer ends
// up guarding them, and the discriminant lets each event carry only what it
// needs.
//
// `parentAgentSpanId` carries the spanId of the wrapping `execute_tool`
// (= the agent_call event) when an event originates from inside a sub-
// agent. The renderer uses it to nest sub-agent events under the parent
// agent_call card.
export type ConversationEvent =
  | {
      kind: 'message'
      timestamp: number
      role: 'user' | 'assistant' | 'system'
      content: string
      spanId?: string
      // Per-span emission order. Two distinct system/user messages in the same
      // chat span's llm_input tail share (spanId, timestamp, role), so callers
      // building React keys need this to disambiguate.
      seq: number
      parentAgentSpanId?: string
      // Set on the assistant message produced by this turn's chat span — the
      // input/output token counts of the LLM call. Not set on historical
      // messages echoed back through later turns' `llm_input`.
      inputTokens?: number
      outputTokens?: number
    }
  | {
      kind: 'utility_chat'
      timestamp: number
      spanId: string
      model?: string
      inputTokens?: number
      outputTokens?: number
      label?: string
    }
  | {
      kind: 'tool_call'
      timestamp: number
      toolName: string
      arguments: JsonValue
      callId: string
      spanId: string
      parentAgentSpanId?: string
    }
  | {
      kind: 'tool_result'
      timestamp: number
      callId: string
      result: JsonValue
      success: boolean
      error?: { kind: string; message: string }
      spanId: string
      parentAgentSpanId?: string
    }
  | {
      kind: 'agent_call'
      timestamp: number
      agentName: string
      input: JsonValue
      result: JsonValue
      spanId: string
      parentAgentSpanId?: string
    }

// Off until ConversationView shows a placeholder when every event is filtered
// out — otherwise traces whose chats are all classified as utility render blank.
const HIDE_UTILITY_CHATS = false

// Build an ordered list of conversation events from spans. Pure — no React,
// no fetches. Test with span fixtures.
export function buildConversation(spans: Span[]): ConversationEvent[] {
  const byId = new Map(spans.map((s) => [s.id, s]))

  // Tool-call IDs that actually have an execute_tool span in *this* trace.
  // The `llm_input` of a chat span carries the full prior thread history,
  // including tool_calls from earlier traces whose execute_tool spans live
  // elsewhere — drop those orphans so they don't render as Pending forever.
  const realCallIds = new Set<string>()
  // Subset of realCallIds whose execute_tool wraps an invoke_agent (sub-agent
  // boundary). Chat spans skip emitting tool_call for these; emitTool emits
  // the agent_call event instead.
  const agentWrappedCallIds = new Set<string>()
  for (const span of spans) {
    if (span.operation === 'tool' && span.toolCallId) {
      realCallIds.add(span.toolCallId)
      if (findWrappedAgent(spans, span.id)) agentWrappedCallIds.add(span.toolCallId)
    }
  }

  // For each span, find its enclosing agent_call (if any) by walking up parents
  // to the first execute_tool ancestor that wraps an invoke_agent. The result
  // is the spanId of that execute_tool (= agent_call.spanId).
  const parentAgentBySpanId = new Map<string, string>()
  for (const span of spans) {
    let curr: Span | undefined = span
    while (curr?.parentId) {
      const parent = byId.get(curr.parentId)
      if (!parent) break
      if (parent.operation === 'tool' && agentWrappedCallIds.has(parent.toolCallId ?? '')) {
        parentAgentBySpanId.set(span.id, parent.id)
        break
      }
      curr = parent
    }
  }

  const events: ConversationEvent[] = []
  const seen = new Set<string>()
  const sorted = [...spans].sort((a, b) => a.startMs - b.startMs)

  const utilityChatIds = findUtilityChatIds(spans)

  for (const span of sorted) {
    const parentAgentSpanId = parentAgentBySpanId.get(span.id)
    if (span.operation === 'chat') {
      if (HIDE_UTILITY_CHATS && utilityChatIds.has(span.id)) {
        emitUtilityChat(span, events)
      } else {
        emitChat(span, events, seen, agentWrappedCallIds, realCallIds, parentAgentSpanId)
      }
    } else if (span.operation === 'tool') {
      emitTool(span, spans, events, parentAgentSpanId)
    }
  }

  events.sort((a, b) => a.timestamp - b.timestamp)
  return events
}

function emitUtilityChat(span: Span, events: ConversationEvent[]): void {
  const firstSystem = asMessages(span.llmInput).find((m) => m.role === 'system')
  const labelPart = firstSystem?.parts.find((p): p is Extract<MessagePart, { kind: 'text' }> => p.kind === 'text')
  const label = labelPart?.content.slice(0, 80).replace(/\n.*/s, '')
  events.push({
    kind: 'utility_chat',
    timestamp: span.startMs,
    spanId: span.id,
    model: span.model,
    inputTokens: span.inputTokens,
    outputTokens: span.outputTokens,
    label,
  })
}

function emitChat(
  span: Span,
  events: ConversationEvent[],
  seen: Set<string>,
  agentWrappedCallIds: Set<string>,
  realCallIds: Set<string>,
  parentAgentSpanId: string | undefined,
): void {
  // llm_input carries this turn's full prior history. To avoid re-emitting
  // messages that earlier chat spans already produced, walk only the "tail":
  // everything AFTER the last assistant message in llm_input. That tail is
  // this turn's new prompt (system+user+tool messages the LLM hadn't seen
  // before this call). The prefix is history — the chat span that originally
  // produced each piece already emitted it via its own llm_output.
  //
  // First chat span of a trace: no assistant in llm_input → tail is the whole
  // array → system+user emit normally. Sub-agent chats: their llm_input is
  // fresh → tail is the whole array too. Works in both shapes.
  const inputMsgs = asMessages(span.llmInput)
  let tailStart = 0
  for (let i = inputMsgs.length - 1; i >= 0; i--) {
    if (inputMsgs[i].role === 'assistant') {
      tailStart = i + 1
      break
    }
  }
  const seq = { n: 0 }
  for (let i = tailStart; i < inputMsgs.length; i++) {
    emitFromMessage(
      inputMsgs[i],
      span.startMs,
      span.id,
      events,
      seen,
      agentWrappedCallIds,
      realCallIds,
      parentAgentSpanId,
      seq,
    )
  }
  // Tokens belong to the LLM call and attach only to its assistant output —
  // not to the user/system/tool input messages.
  const usage = { inputTokens: span.inputTokens, outputTokens: span.outputTokens }
  for (const msg of asMessages(span.llmOutput)) {
    emitFromMessage(
      msg,
      span.endMs,
      span.id,
      events,
      seen,
      agentWrappedCallIds,
      realCallIds,
      parentAgentSpanId,
      seq,
      usage,
    )
  }
}

function emitFromMessage(
  msg: ChatMessage,
  timestamp: number,
  spanId: string,
  events: ConversationEvent[],
  seen: Set<string>,
  agentWrappedCallIds: Set<string>,
  realCallIds: Set<string>,
  parentAgentSpanId: string | undefined,
  seq: { n: number },
  usage?: { inputTokens?: number; outputTokens?: number },
): void {
  for (const part of msg.parts) {
    if (part.kind === 'text') {
      // No content-based dedupe — the caller (emitChat) restricts llm_input
      // to the tail past the last assistant message, so prior-turn echoes
      // never reach this code. Genuinely repeated messages emit twice.
      const event: Extract<ConversationEvent, { kind: 'message' }> = {
        kind: 'message',
        timestamp,
        role: msg.role,
        content: part.content,
        spanId,
        seq: seq.n++,
      }
      if (parentAgentSpanId) event.parentAgentSpanId = parentAgentSpanId
      if (usage) {
        if (usage.inputTokens !== undefined) event.inputTokens = usage.inputTokens
        if (usage.outputTokens !== undefined) event.outputTokens = usage.outputTokens
      }
      events.push(event)
    } else if (part.kind === 'tool_call') {
      if (agentWrappedCallIds.has(part.id)) continue // agent_call handles this
      if (!realCallIds.has(part.id)) continue // orphan from a prior trace
      const key = `call:${part.id}`
      if (seen.has(key)) continue
      seen.add(key)
      const event: Extract<ConversationEvent, { kind: 'tool_call' }> = {
        kind: 'tool_call',
        timestamp,
        toolName: part.name,
        arguments: part.arguments,
        callId: part.id,
        spanId,
      }
      if (parentAgentSpanId) event.parentAgentSpanId = parentAgentSpanId
      events.push(event)
    }
    // tool_call_response parts are intentionally ignored — the matching
    // execute_tool span is the source of truth for the result event.
  }
}

function emitTool(span: Span, spans: Span[], events: ConversationEvent[], parentAgentSpanId: string | undefined): void {
  if (!span.toolName || !span.toolCallId) return

  // execute_tool wrapping an invoke_agent — sub-agent boundary. Emit one
  // agent_call event with input AND the agent's return value.
  const wrappedAgent = findWrappedAgent(spans, span.id)
  if (wrappedAgent) {
    const event: Extract<ConversationEvent, { kind: 'agent_call' }> = {
      kind: 'agent_call',
      timestamp: span.startMs,
      agentName: wrappedAgent.agentName ?? wrappedAgent.name,
      input: parseInputParams(span.inputParams),
      result: span.toolResult ?? null,
      spanId: span.id,
    }
    if (parentAgentSpanId) event.parentAgentSpanId = parentAgentSpanId
    events.push(event)
    return
  }

  // Leaf tool — result only. The matching tool_call was emitted by the chat
  // span whose llm_output carried this call.
  const { success, error } = parseToolResultStatus(span.toolResult)
  const result: Extract<ConversationEvent, { kind: 'tool_result' }> = {
    kind: 'tool_result',
    timestamp: span.endMs,
    callId: span.toolCallId,
    result: span.toolResult ?? null,
    success,
    spanId: span.id,
  }
  if (error) result.error = error
  if (parentAgentSpanId) result.parentAgentSpanId = parentAgentSpanId
  events.push(result)
}

export type MessageRole = 'user' | 'assistant' | 'system'
export type ChatMessage = { role: MessageRole; parts: MessagePart[] }
export type MessagePart =
  | { kind: 'text'; content: string }
  | { kind: 'tool_call'; id: string; name: string; arguments: JsonValue }
  | { kind: 'tool_call_response'; id: string; response: JsonValue }

// Parse OTEL/Logfire message shape. Each message is { role, parts: [...] }
// where parts can be text, tool_call, or tool_call_response. We tolerate
// missing fields and skip malformed entries.
//
// Tool-role messages are dropped here entirely: their payload is a
// `tool_call_response` (the result of an execute_tool span), and the
// `tool_result` event emitted from that span is the source of truth.
// A tool-role message with text content would otherwise render as a
// generic bubble detached from the tool card.
export function asMessages(v: JsonValue | undefined): ChatMessage[] {
  if (!Array.isArray(v)) return []
  const out: ChatMessage[] = []
  for (const item of v) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) continue
    const role = item.role
    if (role !== 'user' && role !== 'assistant' && role !== 'system') continue
    // Logfire format: { role, parts: [...] }
    let parts = asParts(item.parts)
    // OpenAI / OpenLLMetry format: { role, content: "..." | [...] }
    if (parts.length === 0) parts = contentToParts(item.content)
    if (parts.length === 0) continue
    out.push({ role, parts })
  }
  return out
}

function asParts(v: JsonValue | undefined): MessagePart[] {
  if (!Array.isArray(v)) return []
  const out: MessagePart[] = []
  for (const item of v) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) continue
    const type = item.type
    if (type === 'text' && typeof item.content === 'string' && item.content) {
      out.push({ kind: 'text', content: item.content })
    } else if (type === 'tool_call' && typeof item.id === 'string' && typeof item.name === 'string') {
      out.push({
        kind: 'tool_call',
        id: item.id,
        name: item.name,
        arguments: item.arguments ?? null,
      })
    } else if (type === 'tool_call_response' && typeof item.id === 'string') {
      out.push({
        kind: 'tool_call_response',
        id: item.id,
        response: item.response ?? null,
      })
    }
  }
  return out
}

// Handle OpenAI / semconv message format where content is on the message
// directly — either a plain string or an array of content-part objects
// like { type: 'text', text: '...' }.
function contentToParts(v: JsonValue | undefined): MessagePart[] {
  if (typeof v === 'string' && v) return [{ kind: 'text', content: v }]
  if (!Array.isArray(v)) return []
  const out: MessagePart[] = []
  for (const item of v) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) continue
    if (item.type === 'text' && typeof item.text === 'string' && item.text) {
      out.push({ kind: 'text', content: item.text })
    }
  }
  return out
}

// Tool failures don't set span_status=ERROR — the failure lives in the
// result payload. Common shapes: `{ error: true, ... }` or
// `{ status: 'error', message: ... }`.
function parseToolResultStatus(v: JsonValue | undefined): {
  success: boolean
  error?: { kind: string; message: string }
} {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return { success: true }
  const isError = v.error === true || v.status === 'error'
  if (!isError) return { success: true }
  const kind = typeof v.error === 'string' ? v.error : typeof v.status === 'string' ? v.status : 'error'
  const message = typeof v.message === 'string' ? v.message : ''
  return { success: false, error: { kind, message } }
}

function parseInputParams(s: string | undefined): JsonValue {
  if (!s) return null
  return parseJson(s) ?? s
}
