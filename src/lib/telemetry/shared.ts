import { extractAgentName, SESSION_ID_KEYS, SESSION_TITLE_KEYS } from '#/lib/classify-span'
import { asMessages } from '#/lib/conversation'
import { parseJson } from '#/lib/json'
import type { LatencyRow, SessionSummary, ToolErrorRow, ToolPayloadRow } from './types'

export type IdentityFilter = { userId?: string; userName?: string }

export function pickIdentityValue(
  opts: IdentityFilter | undefined,
): { kind: 'id' | 'name'; value: string } | undefined {
  if (opts?.userId) return { kind: 'id', value: opts.userId }
  if (opts?.userName) return { kind: 'name', value: opts.userName }
  return undefined
}

export function mapLatencyRow(row: Record<string, unknown>): LatencyRow {
  const toMs = (v: unknown) => {
    const n = Math.round(Number(v ?? 0))
    return Number.isFinite(n) && n > 0 ? n : 0
  }
  return {
    name: String(row.name ?? row.operation_name ?? '?'),
    p50Ms: toMs(row.p50_ms),
    p90Ms: toMs(row.p90_ms),
    p95Ms: toMs(row.p95_ms),
    p99Ms: toMs(row.p99_ms),
    count: Number(row.count ?? 0),
  }
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
    for (const k of SESSION_ID_KEYS) {
      const v = h[k]
      if (typeof v === 'string' && v) return { id: v, source: 'attribute' }
    }
  }
  // No session attribute on any span — fall back to the trace id so one trace
  // counts as one session. We don't try to infer multi-trace sessions from
  // span names; agent-instance ids identify the agent object, not a
  // conversation, and collapse every run of a singleton agent into one row.
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
    if (!title) title = pickString(h, SESSION_TITLE_KEYS)
    if (!userName) userName = pickString(h, ['user_name'])
    if (!userId) userId = pickString(h, ['user_id'])
    if (!host) host = pickString(h, ['host_name', 'service_name'])
    if (h.gen_ai_operation_name === 'chat') {
      const inp = num(h.gen_ai_usage_input_tokens) ?? 0
      const out = num(h.gen_ai_usage_output_tokens) ?? 0
      const t = num(h.llm_usage_tokens_total) ?? (inp + out > 0 ? inp + out : undefined)
      if (t) tokens += t
      const c = num(h.llm_usage_cost_total)
      if (c) cost += c
      const startNs = Number(h.start_time ?? 0)
      if (startNs && startNs < firstInputAtNs) {
        const candidate = extractFirstUserText(h.llm_input)
        if (candidate) {
          firstInput = candidate
          firstInputAtNs = startNs
        }
      }
    }
    if (h.span_status === 'ERROR') hasError = true
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
