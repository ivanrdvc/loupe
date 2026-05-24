import { extractAgentName } from '#/lib/classify-span'
import { asMessages } from '#/lib/conversation'
import { parseJson } from '#/lib/json'
import { estimateCostUsd } from '#/lib/llm-pricing'
import { pickCanonical, pickCanonicalNumber } from './conventions'
import type { IdentityFilter, SessionSummary, SpansViewKind, ToolErrorRow, ToolPayloadRow } from './types'

// Sessions are reconstructed from raw spans, so the scan has to pull every
// row that could carry a session-identifying attribute. When the cap is hit
// the provider returns `truncated: true` so the UI can warn the user.
export const SESSION_SCAN_LIMIT = 10000
// Hard cap on spans returned for one trace fetch. A trace exceeding this is
// truncated and rendered partially.
export const TRACE_FETCH_LIMIT = 5000

// Spans-tab classifier. Backends return rows matched by either a non-null
// purpose attr (utility) or `invoke_agent` nested under `execute_tool`
// (sub-agent). Two providers feed the same UI, so the row → display fields
// mapping lives here.
export function classifySpanRow(spanName: string, purpose: string): { kind: SpansViewKind; label: string } {
  if (purpose) return { kind: 'utility', label: purpose }
  return { kind: 'sub-agent', label: extractAgentName(spanName) || spanName }
}

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
    // Sessions consisting solely of system-triggered traces (event/scheduled)
    // are background work — don't surface them as user-facing sessions.
    const hasUserTrace = traces.some((t) => !t.triggerType || t.triggerType === 'user')
    if (!hasUserTrace) continue
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
  triggerType?: string
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
  let firstInputAtMs = Number.POSITIVE_INFINITY
  let tokens = 0
  let triggerType: string | undefined
  let cost = 0
  let hasError = false
  for (const h of rows) {
    const s = Number(h.start_ms ?? 0)
    const e = Number(h.end_ms ?? 0)
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
    if (!triggerType) {
      const tt = typeof h.trigger_type === 'string' ? h.trigger_type : undefined
      if (tt) triggerType = tt
    }
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
      if (s && s < firstInputAtMs) {
        const candidate = extractFirstUserText(pickCanonical(h, 'llmInput'))
        if (candidate) {
          firstInput = candidate
          firstInputAtMs = s
        }
      }
    }
    // Flag errors on AI-op spans (chat / invoke_agent / execute_tool) and on
    // session-bearing root spans (e.g. POST /v1/responses/ failing with 5xx).
    // The latter is the user-facing call — its failure means the session
    // failed. Pure infrastructure spans (no AI op, no session attr) are
    // ignored so trigger-receiver noise doesn't pollute.
    if (h.span_status === 'ERROR') {
      const opName = typeof h.operation_name === 'string' ? h.operation_name : ''
      const isAiOp = h.gen_ai_operation_name || opName.startsWith('invoke_agent ') || opName.startsWith('execute_tool ')
      const isSessionRoot = !!pickCanonical(h, 'sessionId')
      if (isAiOp || isSessionRoot) {
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
    triggerType,
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

export function firstString(h: Record<string, unknown>, keys: readonly string[]): string | undefined {
  for (const k of keys) {
    const v = h[k]
    if (typeof v === 'string' && v.length > 0) return v
  }
  return undefined
}

export function buildLogRecord(args: {
  timestampMs: number
  level: import('./types').LogLevel
  message: string
  source?: string
  traceId?: string
  spanId?: string
  attributes?: Record<string, unknown>
}): import('./types').LogRecord {
  const record: import('./types').LogRecord = {
    id: `${args.traceId ?? ''}-${args.spanId ?? ''}-${args.timestampMs}`,
    timestampMs: args.timestampMs,
    level: args.level,
    message: args.message,
  }
  if (args.attributes) {
    try {
      record.attributes = JSON.parse(JSON.stringify(args.attributes))
    } catch {
      // skip if anything in the row resists JSON
    }
  }
  if (args.source) record.source = args.source
  if (args.traceId) record.traceId = args.traceId
  if (args.spanId) record.spanId = args.spanId
  return record
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
