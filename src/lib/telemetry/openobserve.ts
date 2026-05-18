import { classifySpan, extractAgentName, USER_ID_ATTR_KEYS, USER_NAME_ATTR_KEYS } from '#/lib/classify-span'
import type { JsonValue } from '#/lib/json'
import { readFieldConfig } from './field-config'

// Only one session id / title column is materialized in OO today. If a second
// lands, swap these for COALESCE expressions.
const SESSION_ID_COL = 'ag_ui_thread_id'
const SESSION_TITLE_COL = 'ag_ui_thread_title'

import {
  normalizeTraceRoots,
  propagateInheritedAttrs,
  propagateSessionInTrace,
  type Span,
  type SpanKind,
} from '#/lib/spans'
import {
  aggregateSessions,
  groupBy,
  mapLatencyRow,
  mapToolErrorRow,
  mapToolPayloadRow,
  num,
  pickIdentityValue,
} from './shared'
import type {
  GetTraceOpts,
  InventoryDiscoveryKind,
  InventoryObservation,
  LatencyKind,
  LatencyOpts,
  LatencyRow,
  ListTracesOpts,
  OverviewAggregate,
  OverviewOpts,
  SessionFetch,
  TelemetryProvider,
  ToolErrorRow,
  ToolPayloadRow,
  ToolSpark,
  TopOpts,
  TraceSummary,
} from './types'

const SPARK_BUCKETS = 24

export interface OpenObserveConfig {
  baseUrl: string
  org: string
  stream: string
  user: string
  password: string
}

const DEFAULT_SIZE = 1000
const DEFAULT_LIST_LIMIT = 50
// Per-row cap on the session-aggregation scan. Sessions are reconstructed
// in TS from raw spans, so we have to pull every span that could carry
// session-identifying info. If the scan hits this cap, `listSessions`
// reports `truncated: true` so the UI can warn the user.
const SESSION_SCAN_LIMIT = 10000
// Last 30 days — OO scans local Parquet, cost ~free.
const DEFAULT_WINDOW_US = 30 * 24 * 60 * 60 * 1_000_000

const LLM_INPUT_COL = 'llm_input'
const LLM_INPUT_O2_COL = '_o2_llm_input'
const LLM_TOKENS_COL = 'llm_usage_tokens_total'
const LLM_COST_COL = 'llm_usage_cost_total'
const LLM_COST_O2_COL = '_o2_llm_cost_details_total'
const GEN_AI_INPUT_TOKENS_COL = 'gen_ai_usage_input_tokens'
const GEN_AI_OUTPUT_TOKENS_COL = 'gen_ai_usage_output_tokens'
const USER_ID_KEYS = USER_ID_ATTR_KEYS.map(sqlColumnKey)
const USER_NAME_KEYS = USER_NAME_ATTR_KEYS.map(sqlColumnKey)
const HOST_KEYS = ['host_name']

// Remap deployment-specific fields (from CUSTOM_SESSION_ID_FIELDS /
// CUSTOM_USER_ID_FIELDS) to canonical names so the rest of the pipeline
// doesn't need to know about them.
function remapCustomFields(
  h: Record<string, unknown>,
  sessionIdFields: readonly string[],
  userIdFields: readonly string[],
): Record<string, unknown> {
  if (!sessionIdFields.length && !userIdFields.length) return h
  const out = { ...h }
  for (const k of sessionIdFields) {
    if (!out[SESSION_ID_COL] && out[k]) out[SESSION_ID_COL] = out[k]
  }
  for (const k of userIdFields) {
    if (!out['user_id'] && out[k]) out['user_id'] = out[k]
  }
  return out
}

export function createOpenObserveProvider(cfg: OpenObserveConfig): TelemetryProvider {
  const { sessionIdFields, userIdFields } = readFieldConfig()
  const customUserIdCols = userIdFields.filter((k) => !USER_ID_KEYS.includes(k))
  const search = async (
    sql: string,
    fromUs: number,
    toUs: number,
    size = DEFAULT_SIZE,
  ): Promise<Array<Record<string, unknown>>> => {
    const body = JSON.stringify({
      query: { sql, start_time: fromUs, end_time: toUs, from: 0, size },
    })
    const auth = btoa(`${cfg.user}:${cfg.password}`)
    const resp = await fetch(`${cfg.baseUrl}/api/${cfg.org}/_search?type=traces`, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${auth}`,
        'Content-Type': 'application/json',
      },
      body,
    })
    if (!resp.ok) {
      const text = await resp.text()
      // 20002 = stream not yet created (nothing ingested) — treat as empty.
      if (resp.status === 400 && text.includes('"code":20002')) return []
      throw new Error(`OpenObserve ${resp.status}: ${text}`)
    }
    const json = (await resp.json()) as { hits?: unknown[] }
    return (json.hits ?? []) as Array<Record<string, unknown>>
  }

  return {
    name: 'openobserve',
    fingerprint: `${cfg.baseUrl}/${cfg.org}`,

    async getTrace(traceId, opts) {
      const { fromUs, toUs } = window(opts)
      const sql = `SELECT * FROM "${cfg.stream}" WHERE trace_id='${traceId}'`
      const hits = await search(sql, fromUs, toUs)
      if (hits.length === 0) return null
      const spans = hits.map((h) => remapCustomFields(h, sessionIdFields, userIdFields)).map(normalizeOpenObserveHit)
      normalizeTraceRoots(spans)
      propagateSessionInTrace(spans)
      propagateInheritedAttrs(spans)
      return { spans, truncated: hits.length >= DEFAULT_SIZE }
    },

    async listSessions(opts) {
      const { fromUs, toUs } = window(opts)
      const limit = opts?.limit ?? DEFAULT_LIST_LIMIT
      // Pull every row needed to (a) resolve a trace's session id and (b)
      // roll up its tokens/cost. Group by trace in TS, then by session.
      const buildSql = (skip: ReadonlySet<string>) => {
        const has = (k: string) => !skip.has(k)
        const userPredicate = identityPredicate(opts, skip, customUserIdCols)
        return `
        SELECT
          trace_id,
          span_id,
          reference_parent_span_id,
          operation_name,
          ${has(SESSION_ID_COL) ? `${SESSION_ID_COL},` : ''}
          ${sessionIdFields
            .filter((k) => has(k))
            .map((k) => `${k},`)
            .join('\n          ')}
          ${has(SESSION_TITLE_COL) ? `${SESSION_TITLE_COL},` : ''}
          ${coalesceAs([LLM_INPUT_COL, LLM_INPUT_O2_COL], 'llm_input', skip)}
          ${coalesceAs(USER_NAME_KEYS, 'user_name', skip)}
          ${coalesceAs([...USER_ID_KEYS, ...customUserIdCols], 'user_id', skip)}
          ${coalesceAs(HOST_KEYS, 'host_name', skip)}
          start_time,
          end_time,
          gen_ai_operation_name,
          ${has(LLM_TOKENS_COL) ? `${LLM_TOKENS_COL},` : ''}
          ${coalesceAs([LLM_COST_COL, LLM_COST_O2_COL], 'llm_usage_cost_total', skip)}
          ${has(GEN_AI_INPUT_TOKENS_COL) ? `${GEN_AI_INPUT_TOKENS_COL},` : ''}
          ${has(GEN_AI_OUTPUT_TOKENS_COL) ? `${GEN_AI_OUTPUT_TOKENS_COL},` : ''}
          span_status,
          service_name
        FROM "${cfg.stream}"
        WHERE (
          operation_name LIKE 'invoke_agent %'
          OR gen_ai_operation_name = 'chat'
          ${has(SESSION_ID_COL) ? `OR ${SESSION_ID_COL} IS NOT NULL` : ''}
          ${sessionIdFields
            .filter((k) => has(k))
            .map((k) => `OR ${k} IS NOT NULL`)
            .join('\n          ')}
        )
        ${userPredicate ? `AND (${userPredicate})` : opts?.userId || opts?.userName ? 'AND 1 = 0' : ''}
        ORDER BY start_time DESC
        LIMIT ${SESSION_SCAN_LIMIT}
      `
      }
      const hits = await searchDroppingMissing(
        (skip) => search(buildSql(skip), fromUs, toUs, SESSION_SCAN_LIMIT),
        [
          LLM_INPUT_COL,
          LLM_INPUT_O2_COL,
          SESSION_TITLE_COL,
          SESSION_ID_COL,
          ...sessionIdFields,
          LLM_TOKENS_COL,
          LLM_COST_COL,
          LLM_COST_O2_COL,
          GEN_AI_INPUT_TOKENS_COL,
          GEN_AI_OUTPUT_TOKENS_COL,
          ...USER_NAME_KEYS,
          ...USER_ID_KEYS,
          ...customUserIdCols,
          ...HOST_KEYS,
        ],
      )
      const truncated = hits.length >= SESSION_SCAN_LIMIT
      const normalizedHits = hits.map((h) => remapCustomFields(h, sessionIdFields, userIdFields))
      return { sessions: aggregateSessions(normalizedHits, limit), truncated }
    },

    async getSession(sessionId, opts): Promise<SessionFetch> {
      // SQL-injection guard for the interpolated WHERE below.
      if (!/^[A-Za-z0-9_-]+$/.test(sessionId)) return null
      const { fromUs, toUs } = window(opts)
      const buildTraceSql = (skip: ReadonlySet<string>) => {
        // Fallback sessions are just the trace id, so always try matching it
        // directly. Real session-attribute matches win when both are present.
        const clauses: string[] = [`trace_id = '${sessionId}'`]
        if (!skip.has(SESSION_ID_COL)) clauses.push(`${SESSION_ID_COL} = '${sessionId}'`)
        for (const k of sessionIdFields) {
          if (!skip.has(k)) clauses.push(`${k} = '${sessionId}'`)
        }
        const userPredicate = identityPredicate(opts, skip, customUserIdCols)
        return clauses.length === 0
          ? null
          : `SELECT DISTINCT trace_id FROM "${cfg.stream}" WHERE (${clauses.join(' OR ')}) ${
              userPredicate ? `AND (${userPredicate})` : opts?.userId || opts?.userName ? 'AND 1 = 0' : ''
            }`
      }
      const trHits = await searchDroppingMissing(
        (skip) => {
          const sql = buildTraceSql(skip)
          return sql ? search(sql, fromUs, toUs) : Promise.resolve([])
        },
        [SESSION_ID_COL, ...sessionIdFields, ...USER_NAME_KEYS, ...USER_ID_KEYS, ...customUserIdCols],
      )
      const traceIds = trHits.map((h) => String(h.trace_id)).filter(Boolean)
      if (traceIds.length === 0) return null
      const idList = traceIds.map((id) => `'${id}'`).join(',')
      const spanHits = await search(`SELECT * FROM "${cfg.stream}" WHERE trace_id IN (${idList})`, fromUs, toUs)
      const spans = spanHits
        .map((h) => remapCustomFields(h, sessionIdFields, userIdFields))
        .map(normalizeOpenObserveHit)
      // Propagate sessionId per-trace — each trace has its own root invoke_agent.
      for (const trSpans of groupBy(spans, (s) => s.traceId).values()) {
        normalizeTraceRoots(trSpans)
        propagateSessionInTrace(trSpans)
        propagateInheritedAttrs(trSpans)
      }
      const source: 'attribute' | 'trace' = spans.some((s) => s.sessionSource === 'attribute') ? 'attribute' : 'trace'
      let title: string | undefined
      for (const h of spanHits) {
        const v = h[SESSION_TITLE_COL]
        if (typeof v === 'string' && v.trim()) {
          title = v.trim()
          break
        }
      }
      return { sessionId, source, traceIds, spans, title }
    },

    async listTraces(opts) {
      const { fromUs, toUs } = window(opts)
      const limit = opts?.limit ?? DEFAULT_LIST_LIMIT
      // Aggregate by trace_id. Tokens / cost from chat spans only — agent
      // spans roll up the same numbers, so summing all spans would double-count.
      const buildSql = (skip: ReadonlySet<string>) => `
        SELECT
          trace_id,
          MIN(start_time) AS first_seen,
          MAX(end_time)   AS last_seen,
          COUNT(*)        AS span_count,
          ${skip.has(LLM_TOKENS_COL) ? '0' : `SUM(CASE WHEN gen_ai_operation_name = 'chat' THEN ${LLM_TOKENS_COL} ELSE 0 END)`} AS total_tokens,
          ${skip.has(LLM_COST_COL) ? '0' : `SUM(CASE WHEN gen_ai_operation_name = 'chat' THEN ${LLM_COST_COL} ELSE 0 END)`} AS total_cost,
          MAX(CASE WHEN operation_name LIKE 'invoke_agent %' THEN operation_name END) AS sample_agent,
          MAX(CASE WHEN span_status = 'ERROR' THEN 1 ELSE 0 END) AS has_error,
          ${skip.has(SESSION_ID_COL) ? '' : `MAX(${SESSION_ID_COL}) AS session_id,`}
          MAX(service_name)    AS service_name
        FROM "${cfg.stream}"
        WHERE gen_ai_operation_name IS NOT NULL
        GROUP BY trace_id
        ORDER BY first_seen DESC
        LIMIT ${limit}
      `
      const hits = await searchDroppingMissing(
        (skip) => search(buildSql(skip), fromUs, toUs, limit),
        [SESSION_ID_COL, LLM_TOKENS_COL, LLM_COST_COL],
      )
      return hits.map(hitToSummary)
    },

    async discoverInventory(kind, opts) {
      const { fromUs, toUs } = window(opts)
      const isTool = kind === 'new_tool'
      const sql = `
        SELECT
          operation_name,
          MIN(start_time) AS first_seen,
          MAX(start_time) AS last_seen,
          MIN(trace_id) AS sample_trace_id
        FROM "${cfg.stream}"
        WHERE operation_name LIKE '${isTool ? 'execute_tool' : 'invoke_agent'} %'
        GROUP BY operation_name
        ORDER BY first_seen DESC
        LIMIT 1000
      `
      const hits = await search(sql, fromUs, toUs, 1000)
      return hits
        .map((hit) => hitToInventoryObservation(kind, hit))
        .filter((o): o is InventoryObservation => o !== null)
    },

    async listToolErrorRates(opts?: TopOpts): Promise<ToolErrorRow[]> {
      const { fromUs, toUs } = window(opts)
      const limit = opts?.limit ?? 5
      const sql = `
        SELECT
          operation_name AS name,
          SUM(CASE WHEN span_status = 'ERROR' THEN 1 ELSE 0 END) AS errors,
          COUNT(*) AS total,
          MAX(CASE WHEN span_status = 'ERROR' THEN trace_id END) AS last_error_trace_id
        FROM "${cfg.stream}"
        WHERE operation_name LIKE 'execute_tool %'
        GROUP BY operation_name
        HAVING errors > 0
        ORDER BY (CAST(errors AS DOUBLE) / total) DESC
        LIMIT ${limit}
      `
      const hits = await searchOrEmpty(() => search(sql, fromUs, toUs, limit))
      return hits.map(mapToolErrorRow)
    },

    async listToolPayloadSizes(opts?: TopOpts): Promise<ToolPayloadRow[]> {
      const { fromUs, toUs } = window(opts)
      const limit = opts?.limit ?? 5
      const sql = `
        SELECT
          operation_name AS name,
          AVG(LENGTH(gen_ai_tool_call_result)) AS avg_chars,
          approx_percentile_cont(LENGTH(gen_ai_tool_call_result), 0.95) AS p95_chars,
          MAX(LENGTH(gen_ai_tool_call_result)) AS max_chars,
          COUNT(*) AS count,
          MAX(trace_id) AS sample_trace_id
        FROM "${cfg.stream}"
        WHERE operation_name LIKE 'execute_tool %'
          AND gen_ai_tool_call_result IS NOT NULL
        GROUP BY operation_name
        ORDER BY p95_chars DESC
        LIMIT ${limit}
      `
      const hits = await searchOrEmpty(() => search(sql, fromUs, toUs, limit))
      return hits.map(mapToolPayloadRow)
    },

    async listToolErrorRatesBucketed(opts?: TopOpts): Promise<ToolSpark[]> {
      const { fromUs, toUs } = window(opts)
      const bucketSec = bucketSecondsFor(fromUs, toUs)
      const sql = `
        SELECT
          operation_name AS name,
          date_bin(INTERVAL '${bucketSec} seconds', to_timestamp_nanos(start_time)) AS bucket,
          SUM(CASE WHEN span_status = 'ERROR' THEN 1 ELSE 0 END) AS value
        FROM "${cfg.stream}"
        WHERE operation_name LIKE 'execute_tool %'
        GROUP BY name, bucket
        ORDER BY name, bucket
      `
      const hits = await searchOrEmpty(() => search(sql, fromUs, toUs, 5000))
      return groupSparks(hits, fromUs, toUs, bucketSec)
    },

    async listToolPayloadSizesBucketed(opts?: TopOpts): Promise<ToolSpark[]> {
      const { fromUs, toUs } = window(opts)
      const bucketSec = bucketSecondsFor(fromUs, toUs)
      const sql = `
        SELECT
          operation_name AS name,
          date_bin(INTERVAL '${bucketSec} seconds', to_timestamp_nanos(start_time)) AS bucket,
          AVG(LENGTH(gen_ai_tool_call_result)) AS value
        FROM "${cfg.stream}"
        WHERE operation_name LIKE 'execute_tool %'
          AND gen_ai_tool_call_result IS NOT NULL
        GROUP BY name, bucket
        ORDER BY name, bucket
      `
      const hits = await searchOrEmpty(() => search(sql, fromUs, toUs, 5000))
      return groupSparks(hits, fromUs, toUs, bucketSec)
    },

    async getOverview(opts?: OverviewOpts): Promise<OverviewAggregate> {
      const { fromUs, toUs } = window(opts)
      const sql = `
        SELECT
          COUNT(DISTINCT trace_id) AS runs,
          COUNT(DISTINCT CASE WHEN span_status = 'ERROR' THEN trace_id END) AS errored_runs,
          approx_percentile_cont(CASE WHEN gen_ai_operation_name = 'chat' THEN duration END, 0.95) / 1000 AS p95_chat_ms,
          SUM(CASE WHEN gen_ai_operation_name = 'chat' THEN llm_usage_cost_total ELSE 0 END) AS total_cost
        FROM "${cfg.stream}"
        WHERE gen_ai_operation_name IS NOT NULL
           OR operation_name LIKE 'execute_tool %'
           OR operation_name LIKE 'invoke_agent %'
      `
      const hits = await searchOrEmpty(() => search(sql, fromUs, toUs, 1))
      const row = hits[0] ?? {}
      return {
        runs: Number(row.runs ?? 0),
        erroredRuns: Number(row.errored_runs ?? 0),
        p95ChatMs: Math.round(Number(row.p95_chat_ms ?? 0)),
        totalCostUsd: Number(row.total_cost ?? 0),
      }
    },

    async listLatencyPercentiles(kind: LatencyKind, opts?: LatencyOpts): Promise<LatencyRow[]> {
      const { fromUs, toUs } = window(opts)
      const limit = opts?.limit ?? 5
      const whereClause =
        kind === 'generation'
          ? `WHERE gen_ai_operation_name = 'chat'`
          : `WHERE operation_name LIKE 'invoke_agent %' OR gen_ai_operation_name = 'chat'`
      // Duration is µs in OO; divide at query time so both providers return ms.
      const sql = `
        SELECT
          operation_name AS name,
          approx_percentile_cont(duration, 0.5) / 1000 AS p50_ms,
          approx_percentile_cont(duration, 0.9) / 1000 AS p90_ms,
          approx_percentile_cont(duration, 0.95) / 1000 AS p95_ms,
          approx_percentile_cont(duration, 0.99) / 1000 AS p99_ms,
          COUNT(*) AS count
        FROM "${cfg.stream}"
        ${whereClause}
        GROUP BY operation_name
        ORDER BY p95_ms DESC
        LIMIT ${limit}
      `
      const hits = await searchOrEmpty(() => search(sql, fromUs, toUs, limit))
      return hits.map(mapLatencyRow)
    },
  }
}

// OO returns 20004 when the SQL references a column that doesn't exist yet
// (fresh stream, no spans of that shape). Swallow → empty result.
async function searchOrEmpty<T>(run: () => Promise<T[]>): Promise<T[]> {
  try {
    return await run()
  } catch (e) {
    if (e instanceof Error && e.message.includes('"code":20004')) return []
    throw e
  }
}

// Retry a query, dropping each missing optional field one at a time so the
// schema gracefully degrades — if `ag_ui_thread_title` is missing but
// `llm_input` exists, the second attempt keeps `llm_input`.
async function searchDroppingMissing<T>(
  run: (skip: ReadonlySet<string>) => Promise<T>,
  optionalFields: readonly string[],
  maxAttempts = optionalFields.length + 1,
): Promise<T> {
  const skip = new Set<string>()
  for (let i = 0; i < maxAttempts; i++) {
    try {
      return await run(skip)
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      if (!msg.includes('"code":20004')) throw e
      const newlyMissing = optionalFields.filter((f) => !skip.has(f) && msg.includes(`No field named ${f}`))
      if (newlyMissing.length === 0) throw e
      for (const f of newlyMissing) skip.add(f)
    }
  }
  // Final attempt with all optional fields dropped.
  return await run(new Set(optionalFields))
}

function window(opts: GetTraceOpts | ListTracesOpts | undefined): { fromUs: number; toUs: number } {
  const toUs = opts?.toUs ?? Date.now() * 1000
  const fromUs = opts?.fromUs ?? toUs - DEFAULT_WINDOW_US
  return { fromUs, toUs }
}

function sqlColumnKey(attrKey: string): string {
  return attrKey.replaceAll('.', '_')
}

function coalesceAs(keys: readonly string[], alias: string, skip: ReadonlySet<string>): string {
  const available = keys.filter((k) => !skip.has(k))
  if (available.length === 0) return `'' AS ${alias},`
  if (available.length === 1) return `${available[0]} AS ${alias},`
  return `COALESCE(${available.join(', ')}) AS ${alias},`
}

function identityPredicate(
  opts: { userId?: string; userName?: string } | undefined,
  skip: ReadonlySet<string>,
  extraIdCols: readonly string[] = [],
): string | undefined {
  const id = pickIdentityValue(opts)
  if (!id) return undefined
  const cols = id.kind === 'id' ? [...USER_ID_KEYS, ...extraIdCols] : USER_NAME_KEYS
  const keys = cols.filter((k) => !skip.has(k))
  return keys.map((k) => `${k} = ${sqlString(id.value)}`).join(' OR ') || undefined
}

function sqlString(value: string): string {
  return `'${value.replaceAll("'", "''")}'`
}

function hitToSummary(h: Record<string, unknown>): TraceSummary {
  const firstSeenNs = Number(h.first_seen ?? 0)
  const lastSeenNs = Number(h.last_seen ?? 0)
  const summary: TraceSummary = {
    id: String(h.trace_id),
    startedAtMs: Math.floor(firstSeenNs / 1_000_000),
    durationMs: Math.max(0, Math.floor((lastSeenNs - firstSeenNs) / 1_000_000)),
    spanCount: Number(h.span_count ?? 0),
    hasError: Number(h.has_error ?? 0) === 1,
  }
  const tokens = num(h.total_tokens)
  if (tokens) summary.totalTokens = tokens
  const cost = num(h.total_cost)
  if (cost) summary.totalCostUsd = cost
  const agent = extractAgentName(String(h.sample_agent ?? ''))
  if (agent) summary.agent = agent
  const session = h.session_id
  if (typeof session === 'string' && session) summary.sessionId = session
  const service = h.service_name
  if (typeof service === 'string' && service) summary.serviceName = service
  return summary
}

function hitToInventoryObservation(
  kind: InventoryDiscoveryKind,
  h: Record<string, unknown>,
): InventoryObservation | null {
  const operationName = String(h.operation_name ?? '')
  const name = kind === 'new_tool' ? extractToolName(operationName) : extractAgentName(operationName)
  if (!name) return null
  const firstSeenNs = Number(h.first_seen ?? 0)
  const lastSeenNs = Number(h.last_seen ?? firstSeenNs)
  return {
    kind: kind === 'new_tool' ? 'mcp_tool' : 'agent',
    name,
    namespace: '',
    firstSeenMs: Math.floor(firstSeenNs / 1_000_000),
    lastSeenMs: Math.floor(lastSeenNs / 1_000_000),
    traceId: typeof h.sample_trace_id === 'string' ? h.sample_trace_id : undefined,
  }
}

function extractToolName(spanName: string): string | undefined {
  const m = spanName.match(/^execute_tool\s+(\S+)/)
  return m?.[1]
}

// OpenObserve flattens span attributes into top-level row fields (underscore
// form: `gen_ai_request_model`, `llm_usage_tokens_total`, ...). classifySpan
// reads whatever Record we hand it, so we pass the whole hit.
function normalizeOpenObserveHit(h: Record<string, unknown>): Span {
  const operationName = String(h.operation_name ?? '?')
  return {
    id: String(h.span_id),
    traceId: String(h.trace_id ?? ''),
    parentId: (h.reference_parent_span_id as string) || null,
    service: String(h.service_name ?? 'unknown'),
    kind: kindFromNumber(h.span_kind),
    name: operationName,
    // OpenObserve stores start_time/end_time in nanoseconds, duration in microseconds.
    // We normalize to ms throughout the app.
    startMs: Math.floor(Number(h.start_time ?? 0) / 1_000_000),
    endMs: Math.floor(Number(h.end_time ?? 0) / 1_000_000),
    ...(h.span_status === 'ERROR' ? { hasError: true } : {}),
    ...classifySpan(operationName, h),
    rawAttributes: h as Record<string, JsonValue>,
  }
}

function kindFromNumber(raw: unknown): SpanKind {
  // OTel SpanKind: 0 UNSPECIFIED, 1 INTERNAL, 2 SERVER, 3 CLIENT, 4 PRODUCER, 5 CONSUMER
  const n = Number(raw)
  switch (n) {
    case 2:
      return 'server'
    case 3:
      return 'client'
    case 4:
      return 'producer'
    case 5:
      return 'consumer'
    default:
      return 'internal'
  }
}

// Split the user's selected window into ~SPARK_BUCKETS even slices. 60s floor
// avoids a sub-second INTERVAL on very short windows.
function bucketSecondsFor(fromUs: number, toUs: number): number {
  const spanSec = Math.max(60, Math.floor((toUs - fromUs) / 1_000_000))
  return Math.max(60, Math.floor(spanSec / SPARK_BUCKETS))
}

// Roll OO bucket rows into per-tool series. Zero-fills missing buckets so the
// sparkline width is stable across tools regardless of activity.
function groupSparks(
  hits: Array<Record<string, unknown>>,
  fromUs: number,
  toUs: number,
  bucketSec: number,
): ToolSpark[] {
  const bucketMs = bucketSec * 1000
  const startMs = Math.floor(fromUs / 1000)
  const endMs = Math.floor(toUs / 1000)
  const slots: number[] = []
  for (let t = startMs; t < endMs && slots.length < SPARK_BUCKETS; t += bucketMs) slots.push(t)
  if (slots.length === 0) return []
  const byName = new Map<string, Map<number, number>>()
  for (const h of hits) {
    const name = String(h.name ?? '')
    if (!name) continue
    const ts = parseBucketMs(h.bucket)
    if (ts === undefined) continue
    const value = Number(h.value ?? 0)
    let m = byName.get(name)
    if (!m) {
      m = new Map()
      byName.set(name, m)
    }
    m.set(ts, value)
  }
  const out: ToolSpark[] = []
  for (const [name, m] of byName) {
    const buckets = slots.map((ts) => ({ ts, value: nearest(m, ts, bucketMs) }))
    out.push({ name, buckets })
  }
  return out
}

// OO's date_bin returns either an ISO string ("2026-05-17T08:00:00") or an
// already-epoch number depending on the column type. Handle both.
function parseBucketMs(raw: unknown): number | undefined {
  if (typeof raw === 'number') return raw < 1e12 ? raw * 1000 : raw
  if (typeof raw === 'string') {
    const ms = Date.parse(raw.endsWith('Z') ? raw : `${raw}Z`)
    return Number.isFinite(ms) ? ms : undefined
  }
  return undefined
}

// date_bin places hits on bucket starts that may not match our zero-fill grid
// exactly (when fromUs isn't on a bucket boundary). Snap each hit to the
// closest slot.
function nearest(m: Map<number, number>, slot: number, bucketMs: number): number {
  if (m.has(slot)) return m.get(slot) ?? 0
  const lo = slot
  const hi = slot + bucketMs - 1
  for (const [ts, v] of m) {
    if (ts >= lo && ts <= hi) return v
  }
  return 0
}
