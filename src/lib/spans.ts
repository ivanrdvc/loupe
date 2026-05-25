import type { JsonValue } from './json'

export interface ToolCallResolution {
  subAgent?: Span
  result?: JsonValue
  success: boolean
}

// Index tool-call ids in a trace to their resolution (result + sub-agent
// linkage). Builds the parent→children map once, then resolves each tool
// span in O(1).
export function resolveToolCalls(spans: Span[]): Map<string, ToolCallResolution> {
  const byParent = new Map<string | null, Span[]>()
  for (const s of spans) {
    const arr = byParent.get(s.parentId) ?? []
    arr.push(s)
    byParent.set(s.parentId, arr)
  }
  const map = new Map<string, ToolCallResolution>()
  for (const t of spans) {
    if (t.operation !== 'tool' || !t.toolCallId) continue
    const subAgent = byParent.get(t.id)?.find((c) => c.operation === 'invoke_agent')
    map.set(t.toolCallId, {
      subAgent,
      result: t.toolResult,
      success: !spanHasError(t),
    })
  }
  return map
}

export type SpanKind = 'server' | 'client' | 'internal' | 'producer' | 'consumer'
export type Operation = 'http' | 'chat' | 'tool' | 'mcp' | 'invoke_agent'

export interface Span {
  id: string
  traceId: string
  parentId: string | null
  service: string
  kind: SpanKind
  operation: Operation
  name: string
  startMs: number
  endMs: number
  tokens?: number
  inputTokens?: number
  outputTokens?: number
  costUsd?: number
  agentName?: string
  agentId?: string
  agentDescription?: string
  toolName?: string
  inputParams?: string
  model?: string

  // Present on chat spans — what the LLM was sent and what it replied.
  llmInput?: JsonValue
  llmOutput?: JsonValue
  cachedTokens?: number
  reasoningTokens?: number
  toolDefinitions?: JsonValue
  finishReasons?: string[]
  provider?: string
  ttftMs?: number
  responseId?: string
  systemFingerprint?: string
  // True when OTel span_status was ERROR. Set at the provider boundary;
  // classify-span.ts (attribute-only) does not populate it. spanHasError()
  // ORs this with tool-result error detection.
  hasError?: boolean

  errorType?: string
  errorMessage?: string
  errorStack?: string

  // Present on execute_tool spans — pairing key and the tool's return value.
  toolCallId?: string
  toolResult?: JsonValue

  // Session correlation. `attribute` = lifted from a real semconv key
  // (e.g. `session.id`, `gen_ai.conversation.id`). `trace` = fallback using
  // the OTel trace_id when no session attribute is present. UI discloses the source so single-trace sessions don't
  // masquerade as multi-turn conversations.
  sessionId?: string
  sessionSource?: 'attribute' | 'trace'
  agUiRunId?: string
  // Semantic purpose — e.g. "title_generation", "summarization". Set from
  // `gen_ai.operation.purpose`. Distinct from `gen_ai.operation.name` which
  // names the OTel op (chat/invoke_agent/...). This one is the agentops
  // semantic tag (`title_generation`, `summarization`, ...).
  operationName?: string

  // Run-graph identity per the convention spec. Producer-stamped via
  // gen_ai.task.id / gen_ai.task.parent.id (Traceloop/OpenLLMetry convention)
  // or via graph.node.* alias (OpenInference). When the producer omits them,
  // normalizeRunGraph fills them from the span tree: taskId = span_id,
  // taskParentId = nearest ancestor invoke_agent's taskId. Sub-agent detection
  // throughout the codebase reads taskParentId rather than walking trees.
  taskId?: string
  taskParentId?: string
  // `gen_ai.output.type` — `text` by default; non-text values mark a
  // structured call so the UI doesn't render it as a chat reply.
  outputType?: string

  // All provider attributes for the raw-fields inspector view. JsonValue so it
  // survives the SSR serialization boundary.
  rawAttributes?: Record<string, JsonValue>
}

// Defend against producer-side exporter retries that ingest the same span_id
// multiple times. First occurrence wins.
export function dedupeById(spans: Span[]): Span[] {
  const seen = new Map<string, Span>()
  for (const s of spans) if (!seen.has(s.id)) seen.set(s.id, s)
  return seen.size === spans.length ? spans : [...seen.values()]
}

// Treat a span as root when its declared parent is not present in the trace.
// Some providers (OpenObserve) emit the trace id as the root's parent rather
// than empty — see docs/reference/provider-quirks.md. Applied at the provider
// boundary so consumers can trust `parentId === null` means root.
export function normalizeTraceRoots(spans: Span[]): void {
  const ids = new Set(spans.map((s) => s.id))
  for (const s of spans) {
    if (s.parentId && !ids.has(s.parentId)) s.parentId = null
  }
}

// Stamp every span in a trace with the same sessionId. A real `attribute`
// source wins; otherwise fall back to the trace_id (one trace = one session)
// so the UI never invents cross-trace stitching that the data doesn't support.
export function propagateSessionInTrace(spans: Span[]): void {
  let attrId: string | undefined
  for (const s of spans) {
    if (s.sessionSource === 'attribute' && s.sessionId) {
      attrId = s.sessionId
      break
    }
  }
  if (attrId) {
    for (const s of spans) {
      if (!s.sessionId) {
        s.sessionId = attrId
        s.sessionSource = 'attribute'
      }
    }
    return
  }
  const traceId = spans[0]?.traceId
  if (!traceId) return
  for (const s of spans) {
    s.sessionId = traceId
    s.sessionSource = 'trace'
  }
}

// Stamp gen_ai.task.id / gen_ai.task.parent.id on every invoke_agent span that
// lacks them. Producer-emitted attrs win (pass-through). Without producer
// support, fills from span-tree shape: taskId = span_id, parentTaskId = nearest
// ancestor invoke_agent's taskId. Once stamped, sub-agent detection collapses
// to `taskParentId != null` and orchestrator detection to its inverse.
export function normalizeRunGraph(spans: Span[]): void {
  const byId = new Map(spans.map((s) => [s.id, s]))
  for (const s of spans) {
    if (s.operation !== 'invoke_agent') continue
    if (!s.taskId) s.taskId = s.id
    if (s.taskParentId) continue
    let cursor: Span | undefined = s.parentId ? byId.get(s.parentId) : undefined
    while (cursor) {
      if (cursor.operation === 'invoke_agent') {
        s.taskParentId = cursor.taskId ?? cursor.id
        break
      }
      cursor = cursor.parentId ? byId.get(cursor.parentId) : undefined
    }
  }
}

// SDKs set these attrs on a wrapping Activity (utility purpose, AG-UI run)
// but don't re-stamp them on inner spans — inherit from the nearest ancestor.
export function propagateInheritedAttrs(spans: Span[]): void {
  const byId = new Map(spans.map((s) => [s.id, s]))
  const resolved = new Set<string>()
  const resolve = (s: Span) => {
    if (resolved.has(s.id)) return
    const parent = s.parentId ? byId.get(s.parentId) : undefined
    if (parent) resolve(parent)
    if (parent) {
      if (!s.operationName && parent.operationName) s.operationName = parent.operationName
      if (!s.agUiRunId && parent.agUiRunId) s.agUiRunId = parent.agUiRunId
    }
    resolved.add(s.id)
  }
  for (const s of spans) resolve(s)
}

// Returns label overrides for invoke_agent spans whose agentName collides
// with another agentId in the same session. Empty when no collisions.
export function buildAgentLabels(spans: Span[]): Map<string, string> {
  const idsByName = new Map<string, Set<string>>()
  for (const s of spans) {
    if (s.operation !== 'invoke_agent' || !s.agentName || !s.agentId) continue
    let ids = idsByName.get(s.agentName)
    if (!ids) {
      ids = new Set()
      idsByName.set(s.agentName, ids)
    }
    ids.add(s.agentId)
  }
  const out = new Map<string, string>()
  for (const s of spans) {
    if (s.operation !== 'invoke_agent' || !s.agentName || !s.agentId) continue
    if ((idsByName.get(s.agentName)?.size ?? 0) <= 1) continue
    out.set(s.id, `${s.agentName} · ${s.agentId.slice(0, 8)}`)
  }
  return out
}

// Side-channel LLM calls (title gen, summarization). Explicit signal:
// `gen_ai.operation.purpose`. Fallback: in an AG-UI trace, conversation chats
// carry `ag_ui.run_id` and utility chats don't.
export function findUtilityChatIds(spans: Span[]): Set<string> {
  const traceHasAgUiRun = spans.some((s) => s.agUiRunId != null)
  const out = new Set<string>()
  for (const s of spans) {
    if (s.operation !== 'chat') continue
    if (s.operationName) out.add(s.id)
    else if (traceHasAgUiRun && !s.agUiRunId) out.add(s.id)
  }
  return out
}

export function spanHasError(span: Span): boolean {
  if (span.hasError) return true
  const r = span.toolResult
  if (!r || typeof r !== 'object' || Array.isArray(r)) return false
  return r.error === true || r.status === 'error'
}

export function descendantSpans(spans: Span[], rootId: string): Span[] {
  const byParent = new Map<string | null, Span[]>()
  for (const s of spans) {
    const arr = byParent.get(s.parentId) ?? []
    arr.push(s)
    byParent.set(s.parentId, arr)
  }
  const out: Span[] = []
  const walk = (id: string) => {
    for (const c of byParent.get(id) ?? []) {
      out.push(c)
      walk(c.id)
    }
  }
  walk(rootId)
  return out
}

// Top-level invoke_agent spans — those with no invoke_agent ancestor. Read
// directly off the normalised run-graph identity stamped by normalizeRunGraph
// (or by a producer emitting gen_ai.task.parent.id / Traceloop convention).
export function findOrchestratorIds(spans: Span[]): string[] {
  return spans
    .filter((s) => s.operation === 'invoke_agent' && !s.taskParentId)
    .sort((a, b) => a.startMs - b.startMs)
    .map((s) => s.id)
}

export function findOrchestratorId(spans: Span[]): string | null {
  return findOrchestratorIds(spans)[0] ?? null
}

// Chat spans whose nearest invoke_agent ancestor is itself a sub-agent
// (taskParentId set). Excludes orchestrator chats and raw chats with no
// agent ancestor.
export function subagentChatSpans(spans: Span[]): Span[] {
  const byId = new Map(spans.map((s) => [s.id, s]))
  return spans.filter((s) => {
    if (s.operation !== 'chat') return false
    let cursor: Span | undefined = s.parentId ? byId.get(s.parentId) : undefined
    while (cursor) {
      if (cursor.operation === 'invoke_agent') return Boolean(cursor.taskParentId)
      cursor = cursor.parentId ? byId.get(cursor.parentId) : undefined
    }
    return false
  })
}
