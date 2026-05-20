import { type JsonValue, parseJson } from './json'
import { estimateCostUsd } from './llm-pricing'
import type { Operation } from './spans'
import { pickCanonical, pickCanonicalNumber } from './telemetry/conventions'

// GenAI-shaped fields extracted from a span's OTel attributes and span name.
// Every ingest path (push endpoint, OpenObserve, App Insights, ...) hands an
// attribute bag here. The rules — which key forms count, which fallbacks
// apply, how the span name backs up missing attributes — live in this file.
export interface Classification {
  operation: Operation
  model?: string
  agentName?: string
  agentId?: string
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
  // turn — e.g. "title_generation", "summarization". Producers emit on
  // `gen_ai.operation.purpose` (gen_ai-namespaced extension, not a published
  // OTel attribute). Custom per-deployment keys plug in via
  // CUSTOM_LLM_PURPOSE_FIELD. Distinct from `gen_ai.operation.name` which
  // MEAI uses for span classification (chat, execute_tool, etc.).
  operationName?: string
  // `gen_ai.output.type` — `text` by default; `json`/`json_schema`/`image`
  // signal a structured call (title gen, classification, etc.).
  outputType?: string
}

export function classifySpan(name: string, attrs: Record<string, unknown>, spanStartMs?: number): Classification {
  const operation = pickOperation(name, attrs)
  const c: Classification = { operation }

  const model = pickCanonical(attrs, 'model')
  if (model) c.model = model

  const tokens = pickCanonicalNumber(attrs, 'totalTokens')
  if (tokens !== undefined) c.tokens = tokens

  const inputTokens = pickCanonicalNumber(attrs, 'inputTokens')
  if (inputTokens !== undefined) c.inputTokens = inputTokens

  const outputTokens = pickCanonicalNumber(attrs, 'outputTokens')
  if (outputTokens !== undefined) c.outputTokens = outputTokens

  const cost = pickCanonicalNumber(attrs, 'costUsd')
  if (cost !== undefined) c.costUsd = cost

  // `gen_ai.system` is the deprecated form; still emitted by SDKs like
  // OpenLLMetry alongside the newer `gen_ai.provider.name`.
  const provider = pickCanonical(attrs, 'provider')
  if (provider) c.provider = provider

  // Time to first chunk is emitted in seconds (float). Convert to ms to match
  // our duration convention everywhere else.
  const ttftSec = pickNumber(attrs, ['gen_ai.response.time_to_first_chunk', 'gen_ai_response_time_to_first_chunk'])
  if (ttftSec !== undefined && ttftSec >= 0) c.ttftMs = ttftSec * 1000

  // Reasoning-token attr lives outside conventions: only classify-span reads
  // it, and OO/AI builders never aggregate by it.
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
    const agentId = pickAgentId(name, attrs)
    if (agentId) c.agentId = agentId
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

  const operationName = pickCanonical(attrs, 'llmPurpose')
  if (operationName) c.operationName = operationName

  const outputType = pickString(attrs, ['gen_ai.output.type', 'gen_ai_output_type'])
  if (outputType) c.outputType = outputType

  const sessionAttr = pickCanonical(attrs, 'sessionId')
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
    // `_o2_llm_input` / `_o2_llm_output` are OO's alternate column form for
    // payloads that conflicted with reserved names — kept here as a fallback
    // when reading from OO-shaped attribute bags.
    const input = parseJson(pickCanonical(attrs, 'llmInput') ?? pickString(attrs, ['_o2_llm_input']))
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

    const cached = pickCanonicalNumber(attrs, 'cacheReadTokens')
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

  // Fallback when the provider didn't enrich (App Insights & friends).
  // OpenObserve does this at ingest; @pydantic/genai-prices does it here.
  c.costUsd ??= estimateCostUsd({
    model: c.model,
    inputTokens: c.inputTokens,
    outputTokens: c.outputTokens,
    cachedInputTokens: c.cachedTokens,
    provider: c.provider,
    spanStartMs,
  })

  return c
}

function pickOperation(name: string, attrs: Record<string, unknown>): Operation {
  // OpenInference span kind is an explicit producer signal; trust it over inference.
  const oiKind = pickString(attrs, ['openinference.span.kind', 'openinference_span_kind'])
  if (oiKind === 'LLM') return 'chat'
  if (oiKind === 'AGENT') return 'invoke_agent'
  if (oiKind === 'TOOL') return 'tool'

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

function pickAgentId(name: string, attrs: Record<string, unknown>): string | undefined {
  const fromAttr = pickString(attrs, ['gen_ai.agent.id', 'gen_ai_agent_id'])
  if (fromAttr) return fromAttr
  return name.match(/^invoke_agent\s+[^(\s]+\(([^)]+)\)/)?.[1]
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
