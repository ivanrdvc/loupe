import { type JsonValue, parseJson } from '#/lib/json'
import type { Span } from '.'

export interface ToolError {
  kind: string
  message: string
  stack?: string
}

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
      error?: ToolError
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

// Build an ordered list of conversation events from spans. Pure — no React,
// no fetches. Test with span fixtures.
export function buildConversation(spans: Span[]): ConversationEvent[] {
  const byId = new Map(spans.map((s) => [s.id, s]))

  // Index invoke_agent spans by their direct parent (execute_tool wrapping
  // them, in the "agent as tool" pattern). One pass; downstream lookups O(1).
  const wrappedAgentByToolId = new Map<string, Span>()
  for (const span of spans) {
    if (span.operation === 'invoke_agent' && span.parentId) {
      wrappedAgentByToolId.set(span.parentId, span)
    }
  }

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
      if (wrappedAgentByToolId.has(span.id)) agentWrappedCallIds.add(span.toolCallId)
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

  // Group chat spans into turns (a chat span + any chat spans nested beneath it
  // — an agent's per-iteration model calls). One-span-per-turn producers (MEAI)
  // yield turns of one. For multi-iteration turns, each call's input re-sends
  // the full history, so we read it once from the largest input rather than
  // concatenating every call.
  const chatById = new Map<string, Span>()
  for (const span of spans) if (span.operation === 'chat') chatById.set(span.id, span)
  const turns = new Map<string, Span[]>()
  for (const span of chatById.values()) {
    let root = span
    while (root.parentId) {
      const parent = chatById.get(root.parentId)
      if (!parent) break
      root = parent
    }
    const members = turns.get(root.id)
    if (members) members.push(span)
    else turns.set(root.id, [span])
  }

  for (const [rootId, members] of turns) {
    if (members.length === 1) {
      const span = members[0]
      emitChat(span, events, seen, agentWrappedCallIds, realCallIds, parentAgentBySpanId.get(span.id))
      continue
    }
    members.sort((a, b) => a.startMs - b.startMs)
    // First call's input is the clean opening prompt; later iterations re-send
    // it behind an assistant that turnTailStart would skip.
    const seq = { n: 0 }
    const inputSpan = members[0]
    emitChatInput(inputSpan, events, seen, agentWrappedCallIds, realCallIds, parentAgentBySpanId.get(inputSpan.id), seq)
    // The wrapping generation mirrors its steps' final output. Read the steps
    // when any carries output; otherwise the wrapper is the only source.
    const steps = members.filter((s) => s.id !== rootId)
    const outputSpans = steps.some((s) => asMessages(s.llmOutput).length > 0) ? steps : members
    for (const span of outputSpans) {
      emitChatOutput(span, events, seen, agentWrappedCallIds, realCallIds, parentAgentBySpanId.get(span.id), seq)
    }
  }

  for (const span of spans) {
    if (span.operation === 'tool') {
      emitTool(span, wrappedAgentByToolId.get(span.id), events, seen, parentAgentBySpanId.get(span.id))
    }
  }

  events.sort((a, b) => a.timestamp - b.timestamp)
  return events
}

// llm_input carries this turn's full prior history. The "tail" — everything
// AFTER the last assistant message — is this turn's new prompt (system+user+
// tool messages the LLM hadn't seen before this call); the prefix is history
// each earlier chat span already produced via its own llm_output. Returns the
// tail's start index. No assistant present (first chat span of a trace, or a
// sub-agent chat with fresh input) → 0 → the whole input is the turn.
export function turnTailStart(inputMsgs: ChatMessage[]): number {
  for (let i = inputMsgs.length - 1; i >= 0; i--) {
    if (inputMsgs[i].role === 'assistant') return i + 1
  }
  return 0
}

// Input and output share one seq counter so React keys stay unique across both.
function emitChat(
  span: Span,
  events: ConversationEvent[],
  seen: Set<string>,
  agentWrappedCallIds: Set<string>,
  realCallIds: Set<string>,
  parentAgentSpanId: string | undefined,
): void {
  const seq = { n: 0 }
  emitChatInput(span, events, seen, agentWrappedCallIds, realCallIds, parentAgentSpanId, seq)
  emitChatOutput(span, events, seen, agentWrappedCallIds, realCallIds, parentAgentSpanId, seq)
}

function emitChatInput(
  span: Span,
  events: ConversationEvent[],
  seen: Set<string>,
  agentWrappedCallIds: Set<string>,
  realCallIds: Set<string>,
  parentAgentSpanId: string | undefined,
  seq: { n: number },
): void {
  const inputMsgs = asMessages(span.llmInput)
  const tailStart = turnTailStart(inputMsgs)
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
}

function emitChatOutput(
  span: Span,
  events: ConversationEvent[],
  seen: Set<string>,
  agentWrappedCallIds: Set<string>,
  realCallIds: Set<string>,
  parentAgentSpanId: string | undefined,
  seq: { n: number },
): void {
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

function emitTool(
  span: Span,
  wrappedAgent: Span | undefined,
  events: ConversationEvent[],
  seen: Set<string>,
  parentAgentSpanId: string | undefined,
): void {
  if (!span.toolName || !span.toolCallId) return

  // execute_tool wrapping an invoke_agent — sub-agent boundary. Emit one
  // agent_call event with input AND the agent's return value.
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

  // Some instrumentations record only the execution span, never the assistant's
  // tool_call, leaving the result an orphan. Synthesize the call when missing.
  const callKey = `call:${span.toolCallId}`
  if (!seen.has(callKey)) {
    seen.add(callKey)
    const call: Extract<ConversationEvent, { kind: 'tool_call' }> = {
      kind: 'tool_call',
      timestamp: span.startMs,
      toolName: span.toolName,
      arguments: parseInputParams(span.inputParams),
      callId: span.toolCallId,
      spanId: span.id,
    }
    if (parentAgentSpanId) call.parentAgentSpanId = parentAgentSpanId
    events.push(call)
  }

  const error = toolError(span)
  const result: Extract<ConversationEvent, { kind: 'tool_result' }> = {
    kind: 'tool_result',
    timestamp: span.endMs,
    callId: span.toolCallId,
    result: span.toolResult ?? null,
    success: !error,
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

/** Text parts joined; tool calls and reasoning dropped. */
export function messageText(parts: MessagePart[]): string {
  return parts
    .flatMap((p) => (p.kind === 'text' ? [p.content] : []))
    .join('\n')
    .trim()
}

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

// A tool raised (span error status, rich type/message/stack) or returned an
// error-shaped payload. Span-level wins; undefined on success.
export function toolError(span: Span): ToolError | undefined {
  if (span.hasError || span.errorType || span.errorMessage) {
    const fromSpan: ToolError = {
      kind: span.errorType ?? 'error',
      message: span.errorMessage ?? '',
      ...(span.errorStack ? { stack: span.errorStack } : {}),
    }
    // ERROR status but no exception detail — recover it from the payload.
    if (fromSpan.kind === 'error' && !fromSpan.message) return toolResultError(span.toolResult) ?? fromSpan
    return fromSpan
  }
  return toolResultError(span.toolResult)
}

// Error-shaped result payload: `{error:true}` / `{status:'error'}` / Anthropic
// `{is_error:true}` / MCP `{isError:true}`.
export function toolResultError(v: JsonValue | undefined): ToolError | undefined {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return undefined
  if (v.error !== true && v.status !== 'error' && v.is_error !== true && v.isError !== true) return undefined
  const kind = typeof v.error === 'string' ? v.error : typeof v.status === 'string' ? v.status : 'error'
  const message = typeof v.message === 'string' ? v.message : ''
  return { kind, message }
}

function parseInputParams(s: string | undefined): JsonValue {
  if (!s) return null
  return parseJson(s) ?? s
}
