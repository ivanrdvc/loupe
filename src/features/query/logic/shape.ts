import { spanHasError } from '#/features/inspect/logic/predicates'
import type { JsonValue } from '#/lib/json'
import type { Span } from '#/lib/spans'
import { clampIO, type Detail } from './respond'

export interface Aggregates {
  status: 'ok' | 'error'
  span_count: number
  error_count: number
  started_at: string
  duration_ms: number
  total_tokens: number
  input_tokens: number
  output_tokens: number
  cached_tokens: number
  total_cost_usd: number
  agent?: string
  operation?: string
  model?: string
  session_id?: string
}

const rootOf = (spans: Span[]): Span | undefined => {
  const ids = new Set(spans.map((s) => s.id))
  return spans.find((s) => !s.parentId || !ids.has(s.parentId)) ?? spans[0]
}

const hasUsage = (s: Span): boolean => !!(s.inputTokens || s.outputTokens || s.cachedTokens || s.costUsd)

/**
 * Usage rolls up the span tree: an `invoke_agent` (MAF) or wrapper `chat`
 * (AI SDK `generateText` over its `doGenerate` steps) carries the *sum* of its
 * children's tokens. Count only **leaf** usage — a usage-bearing span with no
 * usage-bearing descendant — so totals reconcile regardless of which level the
 * instrumentation stamps (and don't zero out when only the rollup has usage).
 */
function usageLeaves(spans: Span[]): Set<string> {
  const byParent = new Map<string | null, Span[]>()
  for (const s of spans) {
    const list = byParent.get(s.parentId)
    if (list) list.push(s)
    else byParent.set(s.parentId, [s])
  }
  const memo = new Map<string, boolean>()
  const descendantHasUsage = (s: Span): boolean => {
    const cached = memo.get(s.id)
    if (cached !== undefined) return cached
    memo.set(s.id, false) // cycle guard
    const result = (byParent.get(s.id) ?? []).some((c) => hasUsage(c) || descendantHasUsage(c))
    memo.set(s.id, result)
    return result
  }
  return new Set(spans.filter((s) => hasUsage(s) && !descendantHasUsage(s)).map((s) => s.id))
}

/** Sum aggregates straight from the spans — not buildInspectorView, whose
 *  per-turn totals zero out on agent-less traces. */
export function aggregate(spans: Span[]): Aggregates {
  const root = rootOf(spans)
  const leaves = usageLeaves(spans)
  let input = 0
  let output = 0
  let cached = 0
  let cost = 0
  let errors = 0
  let start = Number.POSITIVE_INFINITY
  let end = 0
  let model: string | undefined
  let session: string | undefined
  for (const s of spans) {
    if (leaves.has(s.id)) {
      input += s.inputTokens ?? 0
      output += s.outputTokens ?? 0
      cached += s.cachedTokens ?? 0
      cost += s.costUsd ?? 0
    }
    if (spanHasError(s)) errors++
    if (s.startMs < start) start = s.startMs
    if (s.endMs > end) end = s.endMs
    if (!model && s.model) model = s.model
    if (!session && s.sessionId) session = s.sessionId
  }
  return {
    status: errors > 0 ? 'error' : 'ok',
    span_count: spans.length,
    error_count: errors,
    started_at: new Date(Number.isFinite(start) ? start : 0).toISOString(),
    duration_ms: Number.isFinite(start) ? end - start : 0,
    total_tokens: input + output,
    input_tokens: input,
    output_tokens: output,
    cached_tokens: cached,
    total_cost_usd: cost,
    agent: root?.agentName,
    operation: root?.operation,
    model,
    session_id: session,
  }
}

export interface SpanNode {
  id: string
  parent_id: string | null
  name: string
  operation: string
  kind: string
  start_ms: number
  duration_ms: number
  agent?: string
  tool?: string
  model?: string
  tokens?: { input?: number; output?: number; cached?: number }
  cost_usd?: number
  error?: { type?: string; message?: string; stack?: string }
  input?: JsonValue
  output?: JsonValue
  raw?: Record<string, JsonValue>
  children: SpanNode[]
}

const spanInput = (s: Span): JsonValue | undefined => s.llmInput ?? s.inputParams ?? s.retrievalQuery
const spanOutput = (s: Span): JsonValue | undefined =>
  s.llmOutput ?? s.toolResult ?? (s.retrievalDocuments as JsonValue | undefined)

function mapSpan(s: Span, detail: Detail): SpanNode {
  const tokens =
    s.inputTokens || s.outputTokens || s.cachedTokens
      ? { input: s.inputTokens, output: s.outputTokens, cached: s.cachedTokens }
      : undefined
  return {
    id: s.id,
    parent_id: s.parentId,
    name: s.name,
    operation: s.operation,
    kind: s.kind,
    start_ms: s.startMs,
    duration_ms: s.endMs - s.startMs,
    agent: s.agentName,
    tool: s.toolName,
    model: s.model,
    tokens,
    cost_usd: s.costUsd,
    // Errors are never clamped — the whole point of debugging access.
    error: spanHasError(s) ? { type: s.errorType, message: s.errorMessage, stack: s.errorStack } : undefined,
    input: clampIO(spanInput(s), detail),
    output: clampIO(spanOutput(s), detail),
    raw: detail === 'raw' ? s.rawAttributes : undefined,
    children: [],
  }
}

/** Classified spans as the tree loupe built — nested by parent, sorted by start. */
export function spanTree(spans: Span[], detail: Detail): SpanNode[] {
  const nodes = new Map<string, SpanNode>()
  for (const s of spans) nodes.set(s.id, mapSpan(s, detail))
  const roots: SpanNode[] = []
  const attached = new Set<string>()
  for (const s of spans) {
    const node = nodes.get(s.id)
    if (!node) continue
    const parent = s.parentId ? nodes.get(s.parentId) : undefined
    if (parent) {
      parent.children.push(node)
      attached.add(node.id)
    } else roots.push(node)
  }
  // Recover nodes orphaned by a parent cycle (malformed data) — surface them as
  // roots rather than silently dropping them from a debugging view.
  const reachable = new Set<string>()
  const mark = (n: SpanNode) => {
    if (reachable.has(n.id)) return
    reachable.add(n.id)
    for (const c of n.children) mark(c)
  }
  for (const r of roots) mark(r)
  for (const node of nodes.values()) {
    if (!reachable.has(node.id) && attached.has(node.id)) roots.push(node)
  }
  const sort = (list: SpanNode[], seen = new Set<string>()) => {
    list.sort((a, b) => a.start_ms - b.start_ms)
    for (const n of list) {
      if (seen.has(n.id)) continue
      seen.add(n.id)
      sort(n.children, seen)
    }
  }
  sort(roots)
  return roots
}
