import { extractAgentName } from '#/lib/classify-span'
import { asMessages } from '#/lib/conversation'
import { parseJson } from '#/lib/json'
import { estimateCostUsd } from '#/lib/llm-pricing'
import { pickCanonical, pickCanonicalNumber } from './conventions'
import type { SessionSummary, ToolErrorRow, ToolPayloadRow } from './types'

export type IdentityFilter = { userId?: string; userName?: string }

export function pickIdentityValue(
  opts: IdentityFilter | undefined,
): { kind: 'id' | 'name'; value: string } | undefined {
  if (opts?.userId) return { kind: 'id', value: opts.userId }
  if (opts?.userName) return { kind: 'name', value: opts.userName }
  return undefined
}

export function mapToolErrorRow(row: Record<string, unknown>): ToolErrorRow {
  const errors = Number(row.errors ?? 0)
  const total = Number(row.total ?? 0)
  const last = row.last_error_trace_id
  return {
    name: String(row.name ?? row.operation_name ?? '?'),
    errors,
    total,
    errorRate: total > 0 ? errors / total : 0,
    lastErrorTraceId: typeof last === 'string' && last ? last : undefined,
  }
}

export function mapToolPayloadRow(row: Record<string, unknown>): ToolPayloadRow {
  // LENGTH() in DataFusion returns char count for string columns — same as bytes
  // for ASCII, slightly off for multibyte. Close enough for context-budget framing.
  const toChars = (v: unknown) => {
    const n = Math.round(Number(v ?? 0))
    return Number.isFinite(n) && n > 0 ? n : 0
  }
  const sample = row.sample_trace_id
  return {
    name: String(row.name ?? row.operation_name ?? '?'),
    avgChars: toChars(row.avg_chars),
    p95Chars: toChars(row.p95_chars),
    maxChars: toChars(row.max_chars),
    count: Number(row.count ?? 0),
    sampleTraceId: typeof sample === 'string' && sample ? sample : undefined,
  }
}

export function aggregateSessions(hits: Array<Record<string, unknown>>, limit: number): SessionSummary[] {
  const rowsByTrace = groupBy(
    hits.filter((h) => h.trace_id),
    (h) => String(h.trace_id),
  )
  const tracesBySession = new Map<string, TraceSession[]>()
  for (const [traceId, rows] of rowsByTrace) {
    const ts = resolveTraceSession(traceId, rows)
    if (!ts) continue
    const arr = tracesBySession.get(ts.sessionId) ?? []
    arr.push(ts)
    tracesBySession.set(ts.sessionId, arr)
  }

  const out: SessionSummary[] = []
  for (const [sessionId, traces] of tracesBySession) {
    const source: 'attribute' | 'trace' = traces.some((t) => t.source === 'attribute') ? 'attribute' : 'trace'
    const s: SessionSummary = {
      sessionId,
      title: pickLatest(traces, (t) => t.title),
      userName: pickLatest(traces, (t) => t.userName),
      userId: pickLatest(traces, (t) => t.userId),
      host: pickLatest(traces, (t) => t.host),
      source,
      startedAtMs: Math.min(...traces.map((t) => t.startMs)),
      lastSeenMs: Math.max(...traces.map((t) => t.endMs)),
      activeDurationMs: traces.reduce((acc, t) => acc + Math.max(0, t.endMs - t.startMs), 0),
      traceCount: traces.length,
      agents: [...new Set(traces.flatMap((t) => [...t.agents]))],
      firstInput: traces
        .slice()
        .sort((a, b) => a.startMs - b.startMs)
        .find((t) => t.firstInput)?.firstInput,
    }
    const totalTokens = traces.reduce((acc, t) => acc + t.tokens, 0)
    if (totalTokens > 0) s.totalTokens = totalTokens
    const totalCost = traces.reduce((acc, t) => acc + t.cost, 0)
    if (totalCost > 0) s.totalCostUsd = totalCost
    if (traces.some((t) => t.hasError)) s.hasError = true
    // A session is a producer-declared conversation grouping. Traces without
    // a session attribute belong on the Runs page, not here.
    if (s.source !== 'attribute') continue
    out.push(s)
  }

  out.sort((a, b) => b.lastSeenMs - a.lastSeenMs)
  return out.slice(0, limit)
}

export function findSessionKey(
  rows: Array<Record<string, unknown>>,
  fallbackTraceId?: string,
): { id: string; source: 'attribute' | 'trace' } | undefined {
  for (const h of rows) {
    const id = pickCanonical(h, 'sessionId')
    if (id) return { id, source: 'attribute' }
  }
  // No session attribute on any span — fall back to the trace id so one trace
  // counts as one session.
  const traceId = fallbackTraceId ?? (typeof rows[0]?.trace_id === 'string' ? (rows[0].trace_id as string) : undefined)
  return traceId ? { id: traceId, source: 'trace' } : undefined
}

type TraceSession = {
  traceId: string
  sessionId: string
  source: 'attribute' | 'trace'
  startMs: number
  endMs: number
  agents: Set<string>
  title?: string
  userName?: string
  userId?: string
  host?: string
  firstInput?: string
  tokens: number
  cost: number
  hasError: boolean
}

function resolveTraceSession(traceId: string, rows: Array<Record<string, unknown>>): TraceSession | undefined {
  const key = findSessionKey(rows, traceId)
  if (!key) return undefined
  return { traceId, sessionId: key.id, source: key.source, ...rollupTrace(rows) }
}

function rollupTrace(rows: Array<Record<string, unknown>>): Omit<TraceSession, 'traceId' | 'sessionId' | 'source'> {
  let startMs = Number.POSITIVE_INFINITY
  let endMs = 0
  const agents = new Set<string>()
  let title: string | undefined
  let userName: string | undefined
  let userId: string | undefined
  let host: string | undefined
  let firstInput: string | undefined
  let firstInputAtNs = Number.POSITIVE_INFINITY
  let tokens = 0
  let cost = 0
  let hasError = false
  for (const h of rows) {
    const s = Math.floor(Number(h.start_time ?? 0) / 1_000_000)
    const e = Math.floor(Number(h.end_time ?? 0) / 1_000_000)
    if (s && s < startMs) startMs = s
    if (e > endMs) endMs = e
    if (typeof h.operation_name === 'string') {
      const agent = extractAgentName(h.operation_name)
      if (agent) agents.add(agent)
    }
    if (!title) title = pickCanonical(h, 'sessionTitle')
    if (!userName) userName = pickCanonical(h, 'userName')
    if (!userId) userId = pickCanonical(h, 'userId')
    if (!host) host = pickCanonical(h, 'host') ?? pickString(h, ['service_name'])
    if (h.gen_ai_operation_name === 'chat') {
      const inp = pickCanonicalNumber(h, 'inputTokens') ?? 0
      const out = pickCanonicalNumber(h, 'outputTokens') ?? 0
      const t = pickCanonicalNumber(h, 'totalTokens') ?? (inp + out > 0 ? inp + out : undefined)
      if (t) tokens += t
      const c =
        pickCanonicalNumber(h, 'costUsd') ??
        estimateCostUsd({
          model: pickCanonical(h, 'model'),
          inputTokens: inp,
          outputTokens: out,
          cachedInputTokens: pickCanonicalNumber(h, 'cacheReadTokens'),
          provider: pickCanonical(h, 'provider'),
          spanStartMs: s,
        })
      if (c) cost += c
      const startNs = Number(h.start_time ?? 0)
      if (startNs && startNs < firstInputAtNs) {
        const candidate = extractFirstUserText(pickCanonical(h, 'llmInput'))
        if (candidate) {
          firstInput = candidate
          firstInputAtNs = startNs
        }
      }
    }
    // Only flag errors on actual AI-operation spans (chat, invoke_agent,
    // execute_tool). Infrastructure spans that merely carry session.trigger_type
    // should not mark the whole session as errored.
    if (h.span_status === 'ERROR') {
      const opName = typeof h.operation_name === 'string' ? h.operation_name : ''
      if (h.gen_ai_operation_name || opName.startsWith('invoke_agent ') || opName.startsWith('execute_tool ')) {
        hasError = true
      }
    }
  }
  return {
    startMs: startMs === Number.POSITIVE_INFINITY ? 0 : startMs,
    endMs,
    agents,
    title,
    userName,
    userId,
    host,
    firstInput,
    tokens,
    cost,
    hasError,
  }
}

const FIRST_INPUT_MAX_CHARS = 200
function extractFirstUserText(raw: unknown): string | undefined {
  for (const msg of asMessages(parseJson(raw))) {
    if (msg.role !== 'user') continue
    for (const part of msg.parts) {
      if (part.kind === 'text') return part.content.trim().slice(0, FIRST_INPUT_MAX_CHARS) || undefined
    }
  }
  return undefined
}

function pickLatest(traces: TraceSession[], pick: (trace: TraceSession) => string | undefined): string | undefined {
  return traces
    .slice()
    .sort((a, b) => b.endMs - a.endMs)
    .map(pick)
    .find((v): v is string => typeof v === 'string' && v.length > 0)
}

function pickString(row: Record<string, unknown>, keys: readonly string[]): string | undefined {
  for (const key of keys) {
    const v = row[key]
    if (typeof v === 'string' && v.trim()) return v.trim()
  }
  return undefined
}

export function num(v: unknown): number | undefined {
  if (v === null || v === undefined || v === '') return undefined
  const n = Number(v)
  return Number.isFinite(n) ? n : undefined
}

// Single-value string picker — returns the value if it is a non-empty string,
// otherwise undefined. The multi-key variant is `pickString` above.
export function pickStringValue(v: unknown): string | undefined {
  return typeof v === 'string' && v ? v : undefined
}

export function groupBy<T, K>(items: readonly T[], key: (item: T) => K): Map<K, T[]> {
  const out = new Map<K, T[]>()
  for (const item of items) {
    const k = key(item)
    const arr = out.get(k)
    if (arr) arr.push(item)
    else out.set(k, [item])
  }
  return out
}
