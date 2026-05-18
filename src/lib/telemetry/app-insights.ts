import {
  classifySpan,
  HOST_ATTR_KEYS,
  SESSION_ATTR_KEYS,
  SESSION_TITLE_ATTR_KEYS,
  USER_ID_ATTR_KEYS,
  USER_NAME_ATTR_KEYS,
} from '#/lib/classify-span'
import type { JsonValue } from '#/lib/json'
import {
  normalizeTraceRoots,
  propagateInheritedAttrs,
  propagateSessionInTrace,
  type Span,
  type SpanKind,
} from '#/lib/spans'
import { aggregateSessions, groupBy, mapLatencyRow, pickIdentityValue } from './shared'
import type {
  GetTraceOpts,
  InventoryDiscoveryKind,
  InventoryObservation,
  LatencyKind,
  LatencyOpts,
  LatencyRow,
  ListSessionsOpts,
  ListTracesOpts,
  SessionFetch,
  TelemetryProvider,
  TraceFetch,
  TraceSummary,
} from './types'

// SERVER spans land in `requests`; everything else in `dependencies`. OTel
// attribute keys stay verbatim inside `customDimensions`, so classifySpan
// reads them directly. Roll-up logic is shared with the OpenObserve provider
// — AI rows are reshaped to OO column names before aggregateSessions runs.

export interface AppInsightsConfig {
  appId: string
  apiKey: string
  baseUrl?: string
}

const DEFAULT_BASE = 'https://api.applicationinsights.io'
const DEFAULT_LIST_LIMIT = 50
const SESSION_SCAN_LIMIT = 5000
const DEFAULT_TIMESPAN = 'P30D'

const SESSION_ID_COALESCE = `coalesce(${SESSION_ATTR_KEYS.map((k) => `tostring(customDimensions["${k}"])`).join(', ')})`
const SESSION_TITLE_COALESCE = `coalesce(${SESSION_TITLE_ATTR_KEYS.map((k) => `tostring(customDimensions["${k}"])`).join(', ')})`
const USER_NAME_COALESCE = `coalesce(${USER_NAME_ATTR_KEYS.map((k) => `tostring(customDimensions["${k}"])`).join(', ')})`
const USER_ID_COALESCE = `coalesce(${USER_ID_ATTR_KEYS.map((k) => `tostring(customDimensions["${k}"])`).join(', ')})`
const HOST_COALESCE = `coalesce(${HOST_ATTR_KEYS.map((k) => `tostring(customDimensions["${k}"])`).join(', ')}, tostring(cloud_RoleName))`

interface AiQueryResponse {
  tables?: Array<{
    name: string
    columns: { name: string; type: string }[]
    rows: unknown[][]
  }>
  error?: { code: string; message: string }
}

export function createAppInsightsProvider(cfg: AppInsightsConfig): TelemetryProvider {
  const base = cfg.baseUrl ?? DEFAULT_BASE
  const queryUrl = `${base}/v1/apps/${encodeURIComponent(cfg.appId)}/query`

  const kql = async (query: string, timespan = DEFAULT_TIMESPAN): Promise<Array<Record<string, unknown>>> => {
    const resp = await fetch(queryUrl, {
      method: 'POST',
      headers: { 'x-api-key': cfg.apiKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({ query, timespan }),
    })
    if (!resp.ok) {
      throw new Error(`App Insights ${resp.status}: ${await resp.text()}`)
    }
    const data = (await resp.json()) as AiQueryResponse
    if (data.error) throw new Error(`App Insights ${data.error.code}: ${data.error.message}`)
    const table = data.tables?.find((t) => t.name === 'PrimaryResult') ?? data.tables?.[0]
    if (!table) return []
    return table.rows.map((row) => {
      const out: Record<string, unknown> = {}
      table.columns.forEach((c, i) => {
        out[c.name] = row[i]
      })
      return out
    })
  }

  return {
    name: 'app-insights',
    fingerprint: `${base}/${cfg.appId}`,

    async getTrace(traceId, opts): Promise<TraceFetch> {
      if (!isSafeId(traceId)) return null
      const q = `
        union dependencies, requests
        | where operation_Id == "${traceId}"
        | project itemType, id, operation_Id, operation_ParentId, name, timestamp, duration,
                  cloud_RoleName, success, type, customDimensions
        | top ${SESSION_SCAN_LIMIT} by timestamp asc
      `
      const rows = await kql(q, timespanFromOpts(opts))
      if (rows.length === 0) return null
      const spans = rows.map((r) => normalizeAiRow(r, traceId))
      normalizeTraceRoots(spans)
      propagateSessionInTrace(spans)
      propagateInheritedAttrs(spans)
      return { spans, truncated: rows.length >= SESSION_SCAN_LIMIT }
    },

    async listTraces(opts): Promise<TraceSummary[]> {
      const limit = opts?.limit ?? DEFAULT_LIST_LIMIT
      const q = `
        union dependencies, requests
        | extend gen_op = tostring(customDimensions["gen_ai.operation.name"])
        | where isnotempty(gen_op)
        | extend
            in_tok = toint(customDimensions["gen_ai.usage.input_tokens"]),
            out_tok = toint(customDimensions["gen_ai.usage.output_tokens"]),
            sess = ${SESSION_ID_COALESCE},
            end_ts = datetime_add('millisecond', toint(duration), timestamp)
        | summarize
            first_seen = min(timestamp),
            last_seen  = max(end_ts),
            span_count = count(),
            total_tokens = sum(iff(gen_op == "chat", coalesce(in_tok, 0) + coalesce(out_tok, 0), 0)),
            agent_names = make_set_if(name, name startswith "invoke_agent ", 5),
            has_error   = countif(success == false) > 0,
            session_id  = take_any(sess),
            service_name = take_any(cloud_RoleName)
          by operation_Id
        | top ${limit} by first_seen desc
      `
      const rows = await kql(q, timespanFromOpts(opts))
      return rows.map(rowToTraceSummary)
    },

    async listSessions(opts) {
      const userFilter = kqlIdentityFilter(opts)
      const q = `
        union dependencies, requests
        | extend gen_op = tostring(customDimensions["gen_ai.operation.name"])
        | where isnotempty(gen_op) or name startswith "invoke_agent "
        ${userFilter ? `| where ${userFilter}` : ''}
        | project
            trace_id = operation_Id,
            span_id = id,
            reference_parent_span_id = operation_ParentId,
            operation_name = name,
            start_time_iso = timestamp,
            duration_ms = duration,
            gen_ai_operation_name = gen_op,
            llm_usage_tokens_total = toint(customDimensions["gen_ai.usage.input_tokens"])
                                   + toint(customDimensions["gen_ai.usage.output_tokens"]),
            llm_usage_cost_total = todouble(customDimensions["llm.usage.cost_total"]),
            span_status = iff(success == false, "ERROR", "OK"),
            ag_ui_thread_id = ${SESSION_ID_COALESCE},
            ag_ui_thread_title = ${SESSION_TITLE_COALESCE},
            user_name = ${USER_NAME_COALESCE},
            user_id = ${USER_ID_COALESCE},
            host_name = ${HOST_COALESCE}
        | top ${SESSION_SCAN_LIMIT} by start_time_iso desc
      `
      const rows = await kql(q, timespanFromOpts(opts))
      const limit = opts?.limit ?? DEFAULT_LIST_LIMIT
      const truncated = rows.length >= SESSION_SCAN_LIMIT
      const ooShaped = rows.map(toOpenObserveShape)
      return { sessions: aggregateSessions(ooShaped, limit), truncated }
    },

    async getSession(sessionId, opts): Promise<SessionFetch> {
      if (!isSafeId(sessionId)) return null
      const userFilter = kqlIdentityFilter(opts)
      // Fallback sessions are just the trace id (operation_Id in AI), so match
      // both that and any real session attribute. Real attributes win when
      // both apply because the resulting trace set is the same anyway.
      const tracesQ = `
        union dependencies, requests
        | extend sess = ${SESSION_ID_COALESCE}
        | where sess == "${sessionId}" or operation_Id == "${sessionId}"
        ${userFilter ? `| where ${userFilter}` : ''}
        | distinct operation_Id
      `
      const traceRows = await kql(tracesQ, timespanFromOpts(opts))
      const traceIds = traceRows.map((r) => String(r.operation_Id)).filter(Boolean)
      if (traceIds.length === 0) return null

      const idList = traceIds.map((id) => `"${id}"`).join(',')
      const spansQ = `
        union dependencies, requests
        | where operation_Id in (${idList})
        | project itemType, id, operation_Id, operation_ParentId, name, timestamp, duration,
                  cloud_RoleName, success, type, customDimensions
      `
      const spanRows = await kql(spansQ, timespanFromOpts(opts))
      const spans = spanRows.map((r) => normalizeAiRow(r, String(r.operation_Id ?? '')))

      for (const trSpans of groupBy(spans, (s) => s.traceId).values()) {
        normalizeTraceRoots(trSpans)
        propagateSessionInTrace(trSpans)
        propagateInheritedAttrs(trSpans)
      }

      const source: 'attribute' | 'trace' = spans.some((s) => s.sessionSource === 'attribute') ? 'attribute' : 'trace'
      let title: string | undefined
      for (const r of spanRows) {
        const cd = parseCustomDimensions(r.customDimensions)
        for (const k of SESSION_TITLE_ATTR_KEYS) {
          const v = cd[k]
          if (typeof v === 'string' && v.trim()) {
            title = v.trim()
            break
          }
        }
        if (title) break
      }
      return { sessionId, source, traceIds, spans, title }
    },

    async discoverInventory(kind, opts): Promise<InventoryObservation[]> {
      const prefix = kind === 'new_tool' ? 'execute_tool' : 'invoke_agent'
      const q = `
        union dependencies, requests
        | where name startswith "${prefix} "
        | summarize
            first_seen = min(timestamp),
            last_seen  = max(timestamp),
            sample_trace_id = any(operation_Id)
          by operation_name = name
        | top 1000 by first_seen desc
      `
      const rows = await kql(q, timespanFromOpts(opts))
      return rows.map((r) => rowToInventoryObservation(kind, r)).filter((o): o is InventoryObservation => o !== null)
    },

    async listLatencyPercentiles(kind: LatencyKind, opts?: LatencyOpts): Promise<LatencyRow[]> {
      const limit = opts?.limit ?? 5
      const filter =
        kind === 'generation'
          ? `| where tostring(customDimensions["gen_ai.operation.name"]) == "chat"`
          : `| where name startswith "invoke_agent " or tostring(customDimensions["gen_ai.operation.name"]) == "chat"`
      const q = `
        union dependencies, requests
        ${filter}
        | summarize
            p50_ms = percentile(duration, 50),
            p90_ms = percentile(duration, 90),
            p95_ms = percentile(duration, 95),
            p99_ms = percentile(duration, 99),
            count = count()
          by name
        | top ${limit} by p95_ms desc
      `
      const rows = await kql(q, timespanFromOpts(opts))
      return rows.map(mapLatencyRow)
    },
  }
}

// Refuse anything that would break out of a quoted KQL literal.
function isSafeId(id: string): boolean {
  return /^[A-Za-z0-9_-]+$/.test(id)
}

function parseDynamic(raw: unknown): unknown {
  if (typeof raw !== 'string') return raw
  try {
    return JSON.parse(raw)
  } catch {
    return undefined
  }
}

function parseCustomDimensions(raw: unknown): Record<string, unknown> {
  const v = parseDynamic(raw)
  return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {}
}

const NS_PER_MS = 1_000_000

function timeBounds(timestampIso: unknown, durationMs: unknown): { startMs: number; endMs: number } {
  const startMs = typeof timestampIso === 'string' ? Date.parse(timestampIso) : 0
  const dur = typeof durationMs === 'number' ? durationMs : Number(durationMs ?? 0)
  return { startMs, endMs: startMs + (Number.isFinite(dur) ? dur : 0) }
}

function kindFromAi(row: Record<string, unknown>): SpanKind {
  if (row.itemType === 'request') return 'server'
  const t = typeof row.type === 'string' ? row.type.toLowerCase() : ''
  if (t.includes('http')) return 'client'
  return 'internal'
}

function normalizeAiRow(row: Record<string, unknown>, traceId: string): Span {
  const cd = parseCustomDimensions(row.customDimensions)
  const operationName = String(row.name ?? '?')
  const { startMs, endMs } = timeBounds(row.timestamp, row.duration)
  return {
    id: String(row.id ?? ''),
    traceId,
    parentId: (row.operation_ParentId as string) || null,
    service: String(row.cloud_RoleName ?? 'unknown'),
    kind: kindFromAi(row),
    name: operationName,
    startMs,
    endMs,
    ...classifySpan(operationName, cd),
    rawAttributes: buildAiRawAttributes(row, cd),
  }
}

// customDimensions wins on key collisions — those are the canonical OTel attrs.
function buildAiRawAttributes(
  row: Record<string, unknown>,
  customDimensions: Record<string, unknown>,
): Record<string, JsonValue> {
  const out: Record<string, JsonValue> = {}
  for (const [k, v] of Object.entries(row)) {
    if (k === 'customDimensions') continue
    out[k] = v as JsonValue
  }
  for (const [k, v] of Object.entries(customDimensions)) out[k] = v as JsonValue
  return out
}

function toOpenObserveShape(row: Record<string, unknown>): Record<string, unknown> {
  const start = typeof row.start_time_iso === 'string' ? Date.parse(row.start_time_iso) : 0
  const durMs = typeof row.duration_ms === 'number' ? row.duration_ms : Number(row.duration_ms ?? 0)
  return {
    ...row,
    start_time: start * NS_PER_MS,
    end_time: (start + (Number.isFinite(durMs) ? durMs : 0)) * NS_PER_MS,
  }
}

function rowToTraceSummary(row: Record<string, unknown>): TraceSummary {
  const firstSeen = typeof row.first_seen === 'string' ? Date.parse(row.first_seen) : 0
  const lastSeen = typeof row.last_seen === 'string' ? Date.parse(row.last_seen) : 0
  const summary: TraceSummary = {
    id: String(row.operation_Id ?? ''),
    startedAtMs: firstSeen,
    durationMs: Math.max(0, lastSeen - firstSeen),
    spanCount: Number(row.span_count ?? 0),
    hasError: Boolean(row.has_error),
  }
  const tokens = num(row.total_tokens)
  if (tokens) summary.totalTokens = tokens
  const agents = parseDynamic(row.agent_names)
  if (Array.isArray(agents)) {
    const first = agents.find((s): s is string => typeof s === 'string' && s.startsWith('invoke_agent '))
    const m = first?.match(/^invoke_agent\s+([^(\s]+)/)
    if (m) summary.agent = m[1]
  }
  if (typeof row.session_id === 'string' && row.session_id) summary.sessionId = row.session_id
  if (typeof row.service_name === 'string' && row.service_name) summary.serviceName = row.service_name
  return summary
}

function rowToInventoryObservation(
  kind: InventoryDiscoveryKind,
  row: Record<string, unknown>,
): InventoryObservation | null {
  const operationName = String(row.operation_name ?? '')
  const name =
    kind === 'new_tool'
      ? operationName.match(/^execute_tool\s+(\S+)/)?.[1]
      : operationName.match(/^invoke_agent\s+([^(\s]+)/)?.[1]
  if (!name) return null
  const firstSeen = typeof row.first_seen === 'string' ? Date.parse(row.first_seen) : 0
  const lastSeen = typeof row.last_seen === 'string' ? Date.parse(row.last_seen) : firstSeen
  return {
    kind: kind === 'new_tool' ? 'mcp_tool' : 'agent',
    name,
    namespace: '',
    firstSeenMs: firstSeen,
    lastSeenMs: lastSeen,
    traceId: typeof row.sample_trace_id === 'string' ? row.sample_trace_id : undefined,
  }
}

function kqlIdentityFilter(opts: GetTraceOpts | ListSessionsOpts | undefined): string | undefined {
  const id = pickIdentityValue(opts)
  if (!id) return undefined
  const coalesce = id.kind === 'id' ? USER_ID_COALESCE : USER_NAME_COALESCE
  return `${coalesce} == ${kqlString(id.value)}`
}

function kqlString(value: string): string {
  return JSON.stringify(value)
}

function num(v: unknown): number | undefined {
  if (v === null || v === undefined || v === '') return undefined
  const n = Number(v)
  return Number.isFinite(n) ? n : undefined
}

function timespanFromOpts(opts: GetTraceOpts | ListTracesOpts | ListSessionsOpts | undefined): string {
  if (!opts?.fromUs || !opts.toUs) return DEFAULT_TIMESPAN
  return `${new Date(opts.fromUs / 1000).toISOString()}/${new Date(opts.toUs / 1000).toISOString()}`
}
