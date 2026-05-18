import { type JsonValue, parseJson } from './json'
import type { Operation } from './spans'

// Session-id attribute keys in priority order — first hit wins. Both dotted
// and underscored forms are listed: OpenObserve flattens dots at ingest,
// Application Insights keeps them, and SDKs emit either. Add a pair here
// when a new SDK starts emitting one.
export const SESSION_ATTR_KEYS = [
  'ag_ui.thread_id',
  'ag_ui_thread_id',
  'session.id',
  'session_id',
  'gen_ai.conversation.id',
  'gen_ai_conversation_id',
  'langfuse.session.id',
  'langfuse_session_id',
  'openinference.session.id',
  'openinference_session_id',
] as const

// Subset materialized as top-level columns by OpenObserve's ingest path.
// SQL needs column names, so we can't query the rest cheaply there.
export const SESSION_ID_KEYS = ['ag_ui_thread_id'] as const

export const SESSION_TITLE_ATTR_KEYS = [
  'ag_ui.thread.title',
  'ag_ui_thread_title',
  'session.title',
  'session_title',
  'thread.title',
  'thread_title',
  'gen_ai.conversation.title',
  'gen_ai_conversation_title',
] as const

export const SESSION_TITLE_KEYS = ['ag_ui_thread_title'] as const

export const USER_NAME_ATTR_KEYS = ['user.name', 'user_name', 'enduser.name', 'enduser_name'] as const

export const USER_ID_ATTR_KEYS = [
  'user.id',
  'user_id',
  'enduser.id',
  'enduser_id',
  'ag_ui.user.id',
  'ag_ui_user_id',
] as const

export const HOST_ATTR_KEYS = ['host.name', 'host_name', 'service.name', 'service_name'] as const

// GenAI-shaped fields extracted from a span's OTel attributes and span name.
// Every ingest path (push endpoint, OpenObserve, App Insights, ...) hands an
// attribute bag here. The rules — which key forms count, which fallbacks
// apply, how the span name backs up missing attributes — live in this file.
export interface Classification {
  operation: Operation
  model?: string
  agentName?: string
  agentDescription?: string
  toolName?: string
  toolCallId?: string
  tokens?: number
  inputTokens?: number
  outputTokens?: number
  costUsd?: number
  inputParams?: string
  llmInput?: JsonValue
  llmOutput?: JsonValue
  toolResult?: JsonValue
  cachedTokens?: number
  reasoningTokens?: number
  toolDefinitions?: JsonValue
  finishReasons?: string[]
  provider?: string
  ttftMs?: number
  responseId?: string
  systemFingerprint?: string
  sessionId?: string
  sessionSource?: 'attribute' | 'trace'
  // Present on chat spans that are part of a CopilotKit/AG-UI run. Absent on
  // utility LLM calls (title generation, summarization, etc.) that share the
  // same trace but are not part of the conversation flow.
  agUiRunId?: string
  // Semantic purpose of the LLM call when it's not a user-facing conversation
  // turn — e.g. "title_generation", "summarization". Emitted by the
  // instrumented SDK via `teammate.llm.purpose` (app-scoped per OTel naming
  // spec). Falls back to `gen_ai.operation.purpose` for generic producers.
  // Distinct from `gen_ai.operation.name` which MEAI uses for span
  // classification (chat, execute_tool, etc.) and must not be overridden.
  operationName?: string
  // `gen_ai.output.type` — `text` by default; `json`/`json_schema`/`image`
  // signal a structured call (title gen, classification, etc.).
  outputType?: string
}

export function classifySpan(name: string, attrs: Record<string, unknown>): Classification {
  const operation = pickOperation(name, attrs)
  const c: Classification = { operation }

  const model = pickString(attrs, [
    'gen_ai.request.model',
    'gen_ai_request_model',
    'gen_ai.response.model',
    'gen_ai_response_model',
  ])
  if (model) c.model = model

  const tokens = pickNumber(attrs, ['gen_ai.usage.total_tokens', 'gen_ai_usage_total_tokens', 'llm_usage_tokens_total'])
  if (tokens !== undefined) c.tokens = tokens

  const inputTokens = pickNumber(attrs, [
    'gen_ai.usage.input_tokens',
    'gen_ai_usage_input_tokens',
    'gen_ai.usage.prompt_tokens',
    'gen_ai_usage_prompt_tokens',
    'llm_usage_tokens_input',
    'llm_usage_prompt_tokens',
  ])
  if (inputTokens !== undefined) c.inputTokens = inputTokens

  const outputTokens = pickNumber(attrs, [
    'gen_ai.usage.output_tokens',
    'gen_ai_usage_output_tokens',
    'gen_ai.usage.completion_tokens',
    'gen_ai_usage_completion_tokens',
    'llm_usage_tokens_output',
    'llm_usage_completion_tokens',
  ])
  if (outputTokens !== undefined) c.outputTokens = outputTokens

  const cost = pickNumber(attrs, ['llm_usage_cost_total', 'gen_ai.usage.cost_total'])
  if (cost !== undefined) c.costUsd = cost

  // Provider name. `gen_ai.system` is the deprecated form; still emitted by
  // many SDKs (e.g. OpenLLMetry) alongside the newer `gen_ai.provider.name`.
  const provider = pickString(attrs, ['gen_ai.provider.name', 'gen_ai_provider_name', 'gen_ai.system', 'gen_ai_system'])
  if (provider) c.provider = provider

  // Time to first chunk is emitted in seconds (float). Convert to ms to match
  // our duration convention everywhere else.
  const ttftSec = pickNumber(attrs, ['gen_ai.response.time_to_first_chunk', 'gen_ai_response_time_to_first_chunk'])
  if (ttftSec !== undefined && ttftSec >= 0) c.ttftMs = ttftSec * 1000

  const reasoning = pickNumber(attrs, [
    'gen_ai.usage.reasoning.output_tokens',
    'gen_ai_usage_reasoning_output_tokens',
    'gen_ai.usage.reasoning_output_tokens',
    'gen_ai_usage_reasoning_output.tokens',
  ])
  if (reasoning !== undefined) c.reasoningTokens = reasoning

  if (operation === 'invoke_agent') {
    const agentName = pickAgentName(name, attrs)
    if (agentName) c.agentName = agentName
    const description = pickString(attrs, ['gen_ai.agent.description', 'gen_ai_agent_description'])
    if (description) c.agentDescription = description
  }

  // Session correlation. Priority (lowest tier shown first in code, applied
  // last):
  //   1. (future) DB-persisted sessions — wins when we add persistence
  //   2. Real attribute on the span (`session.id`, `ag_ui.thread_id`, etc.)
  //   3. Agent-instance hex heuristic from `invoke_agent <Name>(<hex>)`
  //      span names — fallback for SDKs that don't emit a session attr.
  // The `sessionSource` field discloses which path produced the id so the
  // UI can label heuristics.
  const agUiRunId = pickString(attrs, ['ag_ui.run_id', 'ag_ui_run_id'])
  if (agUiRunId) c.agUiRunId = agUiRunId

  const operationName = pickString(attrs, [
    'teammate.llm.purpose',
    'teammate_llm_purpose',
    'gen_ai.operation.purpose',
    'gen_ai_operation_purpose',
  ])
  if (operationName) c.operationName = operationName

  const outputType = pickString(attrs, ['gen_ai.output.type', 'gen_ai_output_type'])
  if (outputType) c.outputType = outputType

  const sessionAttr = pickString(attrs, SESSION_ATTR_KEYS)
  if (sessionAttr) {
    c.sessionId = sessionAttr
    c.sessionSource = 'attribute'
  }

  if (operation === 'tool') {
    const toolName = pickToolName(name, attrs)
    if (toolName) c.toolName = toolName
    const callId = pickString(attrs, ['gen_ai.tool.call.id', 'gen_ai_tool_call_id'])
    if (callId) c.toolCallId = callId
    const args = pickString(attrs, ['gen_ai.tool.call.arguments', 'gen_ai_tool_call_arguments'])
    if (args) c.inputParams = args
    const result = parseJson(pickString(attrs, ['gen_ai.tool.call.result', 'gen_ai_tool_call_result']))
    if (result !== undefined) c.toolResult = result
  }

  if (operation === 'chat') {
    // OTEL semconv keys first, Logfire/OpenLLMetry `llm_input`/`llm_output` fallback.
    const input = parseJson(
      pickString(attrs, ['gen_ai.input.messages', 'gen_ai_input_messages', 'llm_input', 'llm.input', '_o2_llm_input']),
    )
    if (input !== undefined) c.llmInput = input
    const output = parseJson(
      pickString(attrs, [
        'gen_ai.output.messages',
        'gen_ai_output_messages',
        'llm_output',
        'llm.output',
        '_o2_llm_output',
      ]),
    )
    if (output !== undefined) c.llmOutput = output

    const cached = pickNumber(attrs, [
      'gen_ai.usage.cache_read.input_tokens',
      'gen_ai_usage_cache_read_input_tokens',
      'gen_ai.usage.cache_read_input_tokens',
      'gen_ai_usage_cache_read.input_tokens',
      'llm_usage_cache_read_tokens',
    ])
    if (cached !== undefined) c.cachedTokens = cached

    const toolDefs = parseJson(
      pickString(attrs, ['gen_ai.tool.definitions', 'gen_ai_tool_definitions', 'llm_request_functions']),
    )
    if (toolDefs !== undefined) c.toolDefinitions = toolDefs

    const finish = pickStringArray(attrs, ['gen_ai.response.finish_reasons', 'gen_ai_response_finish_reasons'])
    if (finish && finish.length > 0) c.finishReasons = finish

    const responseId = pickString(attrs, ['gen_ai.response.id', 'gen_ai_response_id'])
    if (responseId) c.responseId = responseId

    const fingerprint = pickString(attrs, [
      'openai.response.system_fingerprint',
      'openai_response_system_fingerprint',
      'gen_ai.openai.response.system_fingerprint',
      'gen_ai_openai_response_system_fingerprint',
    ])
    if (fingerprint) c.systemFingerprint = fingerprint
  }

  return c
}

function pickOperation(name: string, attrs: Record<string, unknown>): Operation {
  const op = pickString(attrs, ['gen_ai.operation.name', 'gen_ai_operation_name'])
  if (op === 'chat' || op === 'text_completion' || op === 'generate_content') return 'chat'
  if (op === 'invoke_agent' || op === 'create_agent') return 'invoke_agent'
  if (op === 'execute_tool') return 'tool'
  if (name.startsWith('chat ')) return 'chat'
  if (name.startsWith('invoke_agent ')) return 'invoke_agent'
  if (name.startsWith('execute_tool ')) return 'tool'
  return 'http'
}

function pickAgentName(name: string, attrs: Record<string, unknown>): string | undefined {
  const fromAttr = pickString(attrs, ['gen_ai.agent.name', 'gen_ai_agent_name'])
  if (fromAttr) return fromAttr
  return extractAgentName(name)
}

function pickToolName(name: string, attrs: Record<string, unknown>): string | undefined {
  const fromAttr = pickString(attrs, ['gen_ai.tool.name', 'gen_ai_tool_name'])
  if (fromAttr) return fromAttr
  const m = name.match(/^execute_tool\s+(\S+)/)
  return m?.[1]
}

// "invoke_agent Explorer(a9bc...)" -> "Explorer". Exported because trace
// summaries (built from a SQL roll-up of span names) need the same parser.
export function extractAgentName(spanName: string): string | undefined {
  const m = spanName.match(/^invoke_agent\s+([^(\s]+)/)
  return m?.[1]
}

function pickString(attrs: Record<string, unknown>, keys: readonly string[]): string | undefined {
  for (const k of keys) {
    const v = attrs[k]
    if (typeof v === 'string' && v.length > 0) return v
  }
  return undefined
}

// Tolerates real arrays, JSON-encoded arrays (OpenObserve flattens array
// attributes to strings), and single-value strings (some SDKs emit one reason
// instead of an array).
function pickStringArray(attrs: Record<string, unknown>, keys: readonly string[]): string[] | undefined {
  for (const k of keys) {
    const v = attrs[k]
    if (Array.isArray(v)) {
      const out = v.filter((x): x is string => typeof x === 'string' && x.length > 0)
      if (out.length) return out
    }
    if (typeof v === 'string' && v.length > 0) {
      const trimmed = v.trim()
      if (trimmed.startsWith('[')) {
        try {
          const parsed = JSON.parse(trimmed)
          if (Array.isArray(parsed)) {
            const out = parsed.filter((x): x is string => typeof x === 'string' && x.length > 0)
            if (out.length) return out
          }
        } catch {
          // fall through to single-string
        }
      }
      return [trimmed]
    }
  }
  return undefined
}

// Accepts numbers and numeric strings — OpenObserve serializes some SUM()
// aggregates as strings, and we'd rather take the value than drop it.
function pickNumber(attrs: Record<string, unknown>, keys: string[]): number | undefined {
  for (const k of keys) {
    const v = attrs[k]
    if (typeof v === 'number' && Number.isFinite(v)) return v
    if (typeof v === 'string' && v.length > 0) {
      const n = Number(v)
      if (Number.isFinite(n)) return n
    }
  }
  return undefined
}
