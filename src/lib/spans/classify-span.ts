import { type JsonValue, parseJson } from '#/lib/json'
import { pickCanonical, pickCanonicalNumber } from '#/lib/telemetry/conventions'
import type { Operation, TruncatableField, TruncatedAttrSet } from '.'
import { estimateCostUsd } from './llm-pricing'

// Backends (e.g. App Insights customDimensions) clamp string values around 8 KB.
const TRUNCATION_THRESHOLD = 8000

function parseOrFlag(raw: string | undefined, c: Classification, field: TruncatableField): JsonValue | undefined {
  if (raw === undefined) return undefined
  const parsed = parseJson(raw)
  if (parsed === undefined && raw.length >= TRUNCATION_THRESHOLD) {
    c.truncatedAttrs ??= {}
    c.truncatedAttrs[field] = true
  }
  return parsed
}

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
  systemInstructions?: string
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
  // Explicit `ag_ui.thread_id` only — unlike `sessionId`, which is aliased from
  // generic attrs and can hold a non-AG-UI value (e.g. an OpenAI `resp_…` id).
  agUiThreadId?: string
  // Present on chat spans that are part of a CopilotKit/AG-UI run. Absent on
  // utility LLM calls (title generation, summarization, etc.) that share the
  // same trace but are not part of the conversation flow.
  agUiRunId?: string
  // Semantic purpose of the LLM call when it's not a user-facing conversation
  // turn — e.g. "title_generation", "summarization". Producers emit on
  // `gen_ai.operation.purpose` (gen_ai-namespaced extension, not yet a
  // published OTel attribute). Distinct from `gen_ai.operation.name` which
  // MEAI uses for span classification (chat, execute_tool, etc.).
  operationName?: string
  // `gen_ai.output.type` — `text` by default; `json`/`json_schema`/`image`
  // signal a structured call (title gen, classification, etc.).
  outputType?: string
  // Run-graph identity from gen_ai.task.* (or graph.node.* alias). Only set
  // when the producer stamped it; consumer-side normaliser fills the rest.
  taskId?: string
  taskParentId?: string
  truncatedAttrs?: TruncatedAttrSet
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

  const sysRaw = pickString(attrs, ['gen_ai.system_instructions', 'gen_ai_system_instructions'])
  const sysInstructions = parseSystemInstructions(sysRaw)
  if (sysInstructions) c.systemInstructions = sysInstructions
  parseOrFlag(sysRaw, c, 'systemInstructions')

  // Run-graph identity (top-level so producers stamping on non-invoke_agent
  // spans also flow through). graph.node.* is accepted as an alias.
  const taskId = pickString(attrs, ['gen_ai.task.id', 'gen_ai_task_id', 'graph.node.id', 'graph_node_id'])
  if (taskId) c.taskId = taskId
  const taskParentId = pickString(attrs, [
    'gen_ai.task.parent.id',
    'gen_ai_task_parent_id',
    'graph.node.parent_id',
    'graph_node_parent_id',
  ])
  if (taskParentId) c.taskParentId = taskParentId

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

  const agUiThreadId = pickString(attrs, ['ag_ui.thread_id', 'ag_ui_thread_id'])
  if (agUiThreadId) c.agUiThreadId = agUiThreadId

  const operationName = pickCanonical(attrs, 'llmPurpose')
  if (operationName) c.operationName = operationName

  const outputType = pickString(attrs, ['gen_ai.output.type', 'gen_ai_output_type'])
  if (outputType) c.outputType = outputType

  const sessionAttr = pickCanonical(attrs, 'sessionId')
  if (sessionAttr) {
    c.sessionId = sessionAttr
    c.sessionSource = 'attribute'
  }

  // Read on both chat and invoke_agent — chat copy is often truncated.
  const toolDefsRaw = pickString(attrs, ['gen_ai.tool.definitions', 'gen_ai_tool_definitions', 'llm_request_functions'])
  const toolDefs = parseOrFlag(toolDefsRaw, c, 'toolDefinitions')
  if (toolDefs !== undefined) c.toolDefinitions = toolDefs

  if (operation === 'tool' || operation === 'mcp') {
    const toolName = pickToolName(name, attrs)
    if (toolName) c.toolName = toolName
    const callId = pickString(attrs, ['gen_ai.tool.call.id', 'gen_ai_tool_call_id'])
    if (callId) c.toolCallId = callId
    // Scalar form (App Insights/MAF); fall back to the chat-message form
    // (tanstack via OO renames gen_ai.input/output.messages to llm_input/output).
    const args =
      pickString(attrs, ['gen_ai.tool.call.arguments', 'gen_ai_tool_call_arguments']) ??
      toolMessageContent(pickCanonical(attrs, 'llmInput'))
    if (args) {
      c.inputParams = args
      parseOrFlag(args, c, 'inputParams')
    }
    // Raw-string fallback when parse fails — `undefined` check (not nullish)
    // so literal JSON `null` still passes through.
    const rawResult =
      pickString(attrs, ['gen_ai.tool.call.result', 'gen_ai_tool_call_result']) ??
      toolMessageContent(
        pickString(attrs, [
          'gen_ai.output.messages',
          'gen_ai_output_messages',
          'llm_output',
          'llm.output',
          '_o2_llm_output',
        ]),
      )
    if (rawResult !== undefined) {
      const parsed = parseOrFlag(rawResult, c, 'toolResult')
      c.toolResult = parsed !== undefined ? parsed : rawResult
    }
  }

  if (operation === 'chat') {
    // `_o2_llm_input` / `_o2_llm_output` are OO's alternate column form for
    // payloads that conflicted with reserved names.
    const inputRaw = pickCanonical(attrs, 'llmInput') ?? pickString(attrs, ['_o2_llm_input'])
    const input = parseOrFlag(inputRaw, c, 'llmInput')
    if (input !== undefined) c.llmInput = input
    const outputRaw = pickString(attrs, [
      'gen_ai.output.messages',
      'gen_ai_output_messages',
      'llm_output',
      'llm.output',
      '_o2_llm_output',
    ])
    const output = parseOrFlag(outputRaw, c, 'llmOutput')
    if (output !== undefined) c.llmOutput = output
    else {
      // Scalar completion (text-only step): no message array, just the reply
      // string. Wrap as one assistant message. Structured keys above win.
      const scalar = pickString(attrs, [
        'llm_output_content',
        'gen_ai.completion',
        'gen_ai_completion',
        'langfuse.observation.output',
        'langfuse_observation_output',
        'output.value',
        'output_value',
        'ai.response.text',
        'ai_response_text',
      ])
      if (scalar !== undefined) {
        const parsed = parseJson(scalar)
        c.llmOutput = Array.isArray(parsed) ? parsed : [{ role: 'assistant', content: scalar }]
      }
    }

    const cached = pickCanonicalNumber(attrs, 'cacheReadTokens')
    if (cached !== undefined) c.cachedTokens = cached

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

// `gen_ai.system_instructions` is `[{type:"text",content:"..."}, ...]`.
// Regex fallback handles 8 KB customDimensions truncation slicing
// mid-content (JSON parse fails on the partial array).
export function parseSystemInstructions(raw: string | undefined): string | undefined {
  if (!raw) return undefined
  const parsed = parseJson(raw)
  if (Array.isArray(parsed)) {
    const parts = parsed.flatMap((item) =>
      item &&
      typeof item === 'object' &&
      !Array.isArray(item) &&
      item.type === 'text' &&
      typeof item.content === 'string' &&
      item.content
        ? [item.content]
        : [],
    )
    const joined = parts.join('\n\n').trim()
    if (joined) return joined
  }
  // Truncation fallback: pull every `"content":"..."` string we can match.
  const salvaged: string[] = []
  for (const m of raw.matchAll(/"content"\s*:\s*"((?:[^"\\]|\\.)*)/g)) {
    try {
      salvaged.push(JSON.parse(`"${m[1]}"`))
    } catch {
      salvaged.push(m[1])
    }
  }
  const joined = salvaged.join('\n\n').trim()
  return joined || undefined
}

function pickOperation(name: string, attrs: Record<string, unknown>): Operation {
  // OpenInference span kind is an explicit producer signal; trust it over inference.
  const oiKind = pickString(attrs, ['openinference.span.kind', 'openinference_span_kind'])
  if (oiKind === 'LLM') return 'chat'
  if (oiKind === 'AGENT') return 'invoke_agent'
  if (oiKind === 'TOOL') return 'tool'

  // MCP protocol spans — show distinctly from the agent-level execute_tool wrapper.
  if (name.startsWith('tools/')) return 'mcp'

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

// Tool I/O carried as a chat-message array (`[{role,content}]`) rather than a
// scalar — pull the last message's content out. Non-array payloads pass through.
function toolMessageContent(raw: string | undefined): string | undefined {
  if (raw === undefined) return undefined
  const parsed = parseJson(raw)
  if (!Array.isArray(parsed)) return raw
  const last = parsed.at(-1)
  const content = last && typeof last === 'object' ? (last as { content?: unknown }).content : undefined
  if (content === undefined) return undefined
  return typeof content === 'string' ? content : JSON.stringify(content)
}

function pickToolName(name: string, attrs: Record<string, unknown>): string | undefined {
  const fromAttr = pickString(attrs, ['gen_ai.tool.name', 'gen_ai_tool_name'])
  if (fromAttr) return fromAttr
  return extractToolName(name)
}

// "invoke_agent Explorer(a9bc...)" -> "Explorer". Exported because trace
// summaries (built from a SQL roll-up of span names) need the same parser.
export function extractAgentName(spanName: string): string | undefined {
  const m = spanName.match(/^invoke_agent\s+([^(\s]+)/)
  return m?.[1]
}

// "execute_tool fetch_url" -> "fetch_url". Exported for the same reason
// as extractAgentName: roll-up SQL/KQL queries hand us only the span name.
// Also handles MCP protocol form: "tools/call fetch_url" -> "fetch_url".
export function extractToolName(spanName: string): string | undefined {
  const m = spanName.match(/^(?:execute_tool|tools\/call)\s+(\S+)/)
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
function pickNumber(attrs: Record<string, unknown>, keys: readonly string[]): number | undefined {
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
