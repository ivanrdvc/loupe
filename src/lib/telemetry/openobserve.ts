import {
  classifySpan,
  extractAgentName,
  SESSION_ID_KEYS,
  SESSION_TITLE_KEYS,
  USER_ID_ATTR_KEYS,
  USER_NAME_ATTR_KEYS,
} from '#/lib/classify-span'
import { normalizeTraceRoots, propagateSessionInTrace, type Span, type SpanKind } from '#/lib/spans'
import { aggregateSessions, mapLatencyRow, pickIdentityValue } from './shared'
import type {
  GetTraceOpts,
  InventoryDiscoveryKind,
  InventoryObservation,
  LatencyKind,
  LatencyOpts,
  LatencyRow,
  ListTracesOpts,
  SessionFetch,
  TelemetryProvider,
  TraceSummary,
} from './types'

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

const SESSION_ID_SELECT = SESSION_ID_KEYS.join(', ')
const SESSION_ID_NOT_NULL = SESSION_ID_KEYS.map((k) => `${k} IS NOT NULL`).join(' OR ')
const SESSION_ID_MAX_AS =
  SESSION_ID_KEYS.length === 1
    ? `MAX(${SESSION_ID_KEYS[0]})`
    : `COALESCE(${SESSION_ID_KEYS.map((k) => `MAX(${k})`).join(', ')})`
// `tryWithFallback` keys off one missing column name today — fine while
// SESSION_ID_KEYS has one entry. Generalize when a second key lands.
const SESSION_ID_FALLBACK_KEY = SESSION_ID_KEYS[0]
const SESSION_TITLE_SELECT = SESSION_TITLE_KEYS.join(', ')
const SESSION_TITLE_FALLBACK_KEY = SESSION_TITLE_KEYS[0]

const LLM_INPUT_FALLBACK_KEY = 'llm_input'
const USER_ID_KEYS = USER_ID_ATTR_KEYS.map(sqlColumnKey)
const USER_NAME_KEYS = USER_NAME_ATTR_KEYS.map(sqlColumnKey)
const HOST_KEYS = ['host_name']

export function createOpenObserveProvider(cfg: OpenObserveConfig): TelemetryProvider {
  const search = async (sql: string, fromUs: number, toUs: number, size = DEFAULT_SIZE) => {
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
      if (resp.status === 400 && text.includes('"code":20002')) {
        return { hits: [] }
      }
      throw new Error(`OpenObserve ${resp.status}: ${text}`)
    }
    return (await resp.json()) as { hits?: unknown[] }
  }

  return {
    name: 'openobserve',
    fingerprint: `${cfg.baseUrl}/${cfg.org}`,

    async getTrace(traceId, opts) {
      const { fromUs, toUs } = window(opts)
      const sql = `SELECT * FROM "${cfg.stream}" WHERE trace_id='${traceId}'`
      const data = await search(sql, fromUs, toUs)
      const hits = (data.hits ?? []) as Array<Record<string, unknown>>
      if (hits.length === 0) return { kind: 'not_found' }
      const spans = hits.map(normalizeOpenObserveHit)
      normalizeTraceRoots(spans)
      propagateSessionInTrace(spans)
      const truncated = hits.length >= DEFAULT_SIZE
      return { kind: 'found', spans, truncated }
    },

    async listSessions(opts) {
      const { fromUs, toUs } = window(opts)
      const limit = opts?.limit ?? DEFAULT_LIST_LIMIT
      // Pull every row needed to (a) resolve a trace's session id and (b)
      // roll up its tokens/cost. Group by trace in TS, then by session.
      const buildSql = (skip: ReadonlySet<string>) => {
        const has = (k: string) => !skip.has(k)
        const userPredicate = identityPredicate(opts, skip)
        return `
        SELECT
          trace_id,
          span_id,
          reference_parent_span_id,
          operation_name,
          ${has(SESSION_ID_FALLBACK_KEY) ? `${SESSION_ID_SELECT},` : ''}
          ${has(SESSION_TITLE_FALLBACK_KEY) ? `${SESSION_TITLE_SELECT},` : ''}
          ${has(LLM_INPUT_FALLBACK_KEY) ? `${LLM_INPUT_FALLBACK_KEY},` : ''}
          ${coalesceAs(USER_NAME_KEYS, 'user_name', skip)}
          ${coalesceAs(USER_ID_KEYS, 'user_id', skip)}
          ${coalesceAs(HOST_KEYS, 'host_name', skip)}
          start_time,
          end_time,
          gen_ai_operation_name,
          llm_usage_tokens_total,
          llm_usage_cost_total,
          span_status,
          service_name
        FROM "${cfg.stream}"
        WHERE (
          operation_name LIKE 'invoke_agent %'
          OR gen_ai_operation_name = 'chat'
          ${has(SESSION_ID_FALLBACK_KEY) ? `OR ${SESSION_ID_NOT_NULL}` : ''}
        )
        ${userPredicate ? `AND (${userPredicate})` : opts?.userId || opts?.userName ? 'AND 1 = 0' : ''}
        ORDER BY start_time DESC
        LIMIT ${SESSION_SCAN_LIMIT}
      `
      }
      const data = await searchDroppingMissing(
        (skip) => search(buildSql(skip), fromUs, toUs, SESSION_SCAN_LIMIT),
        [
          LLM_INPUT_FALLBACK_KEY,
          SESSION_TITLE_FALLBACK_KEY,
          SESSION_ID_FALLBACK_KEY,
          ...USER_NAME_KEYS,
          ...USER_ID_KEYS,
          ...HOST_KEYS,
        ],
      )
      const hits = (data.hits ?? []) as Array<Record<string, unknown>>
      const truncated = hits.length >= SESSION_SCAN_LIMIT
      return { sessions: aggregateSessions(hits, limit), truncated }
    },

    async getSession(sessionId, opts): Promise<SessionFetch> {
      // SQL-injection guard for the interpolated WHERE below.
      if (!/^[A-Za-z0-9_-]+$/.test(sessionId)) return { kind: 'not_found' }
      const isHex = /^[a-f0-9]+$/i.test(sessionId)
      const { fromUs, toUs } = window(opts)
      const buildTraceSql = (skip: ReadonlySet<string>) => {
        // Heuristic (agent-instance) sessions use the trace_id as the session id —
        // always try matching it directly so the drawer can resolve them.
        const clauses: string[] = [`trace_id = '${sessionId}'`]
        for (const k of SESSION_ID_KEYS) {
          if (!skip.has(k)) clauses.push(`${k} = '${sessionId}'`)
        }
        if (isHex) clauses.push(`operation_name LIKE 'invoke_agent %(${sessionId})%'`)
        const userPredicate = identityPredicate(opts, skip)
        return clauses.length === 0
          ? null
          : `SELECT DISTINCT trace_id FROM "${cfg.stream}" WHERE (${clauses.join(' OR ')}) ${
              userPredicate ? `AND (${userPredicate})` : opts?.userId || opts?.userName ? 'AND 1 = 0' : ''
            }`
      }
      const trData = await searchDroppingMissing(
        (skip) => {
          const sql = buildTraceSql(skip)
          return sql ? search(sql, fromUs, toUs) : Promise.resolve({ hits: [] })
        },
        [SESSION_ID_FALLBACK_KEY, ...USER_NAME_KEYS, ...USER_ID_KEYS],
      )
      const trHits = (trData.hits ?? []) as Array<Record<string, unknown>>
      const traceIds = trHits.map((h) => String(h.trace_id)).filter(Boolean)
      if (traceIds.length === 0) return { kind: 'not_found' }
      // Step 2: bulk-fetch all spans for those traces.
      const idList = traceIds.map((id) => `'${id}'`).join(',')
      const spansSql = `SELECT * FROM "${cfg.stream}" WHERE trace_id IN (${idList})`
      const spansData = await search(spansSql, fromUs, toUs)
      const spanHits = (spansData.hits ?? []) as Array<Record<string, unknown>>
      const spans = spanHits.map(normalizeOpenObserveHit)
      // Propagate sessionId within each trace independently — different traces
      // in the same session each have their own root invoke_agent.
      const byTrace = new Map<string, Span[]>()
      for (const s of spans) {
        const arr = byTrace.get(s.traceId) ?? []
        arr.push(s)
        byTrace.set(s.traceId, arr)
      }
      for (const trSpans of byTrace.values()) {
        normalizeTraceRoots(trSpans)
        propagateSessionInTrace(trSpans)
      }
      const source: 'attribute' | 'agent-instance' = spans.some((s) => s.sessionSource === 'attribute')
        ? 'attribute'
        : 'agent-instance'
      let title: string | undefined
      for (const h of spanHits) {
        for (const k of SESSION_TITLE_KEYS) {
          const v = h[k]
          if (typeof v === 'string' && v.trim()) {
            title = v.trim()
            break
          }
        }
        if (title) break
      }
      return { kind: 'found', sessionId, source, traceIds, spans, title }
    },

    async listTraces(opts) {
      const { fromUs, toUs } = window(opts)
      const limit = opts?.limit ?? DEFAULT_LIST_LIMIT
      // Aggregate by trace_id. Tokens / cost from chat spans only — agent
      // spans roll up the same numbers, so summing all spans would double-count.
      const buildSql = (withThread: boolean) => `
        SELECT
          trace_id,
          MIN(start_time) AS first_seen,
          MAX(end_time)   AS last_seen,
          COUNT(*)        AS span_count,
          SUM(CASE WHEN gen_ai_operation_name = 'chat' THEN llm_usage_tokens_total ELSE 0 END) AS total_tokens,
          SUM(CASE WHEN gen_ai_operation_name = 'chat' THEN llm_usage_cost_total   ELSE 0 END) AS total_cost,
          MAX(CASE WHEN operation_name LIKE 'invoke_agent %' THEN operation_name END) AS sample_agent,
          MAX(CASE WHEN span_status = 'ERROR' THEN 1 ELSE 0 END) AS has_error,
          ${withThread ? `${SESSION_ID_MAX_AS} AS session_id,` : ''}
          MAX(service_name)    AS service_name
        FROM "${cfg.stream}"
        WHERE gen_ai_operation_name IS NOT NULL
        GROUP BY trace_id
        ORDER BY first_seen DESC
        LIMIT ${limit}
      `
      const data = await tryWithFallback(
        () => search(buildSql(true), fromUs, toUs, limit),
        () => search(buildSql(false), fromUs, toUs, limit),
        SESSION_ID_FALLBACK_KEY,
      )
      const hits = (data.hits ?? []) as Array<Record<string, unknown>>
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
      const data = await search(sql, fromUs, toUs, 1000)
      const hits = (data.hits ?? []) as Array<Record<string, unknown>>
      return hits.flatMap((hit) => hitToInventoryObservation(kind, hit))
    },

    async listLatencyPercentiles(kind: LatencyKind, opts?: LatencyOpts): Promise<LatencyRow[]> {
      const { fromUs, toUs } = window(opts)
      const limit = opts?.limit ?? 5
      const whereClause = kind === 'generation' ? `WHERE gen_ai_operation_name = 'chat'` : ''
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
      try {
        const data = await search(sql, fromUs, toUs, limit)
        const hits = (data.hits ?? []) as Array<Record<string, unknown>>
        return hits.map(mapLatencyRow)
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e)
        // No spans tagged with gen_ai_operation_name in this stream — return empty.
        if (kind === 'generation' && msg.includes('"code":20004') && msg.includes('gen_ai_operation_name')) {
          return []
        }
        throw e
      }
    },
  }
}

async function tryWithFallback<T>(
  primary: () => Promise<T>,
  fallback: () => Promise<T>,
  missingField: string | string[],
): Promise<T> {
  try {
    return await primary()
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    const fields = Array.isArray(missingField) ? missingField : [missingField]
    if (msg.includes('"code":20004') && fields.some((field) => msg.includes(`No field named ${field}`))) {
      return await fallback()
    }
    throw e
  }
}

// Retry a query, dropping each missing optional field one at a time. Unlike
// tryWithFallback's collapse-everything cascade, this preserves fields that
// the schema *does* have — so if `ag_ui_thread_title` is missing but
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
  const available = unique(keys).filter((k) => !skip.has(k))
  if (available.length === 0) return `'' AS ${alias},`
  if (available.length === 1) return `${available[0]} AS ${alias},`
  return `COALESCE(${available.join(', ')}) AS ${alias},`
}

function identityPredicate(
  opts: { userId?: string; userName?: string } | undefined,
  skip: ReadonlySet<string>,
): string | undefined {
  const id = pickIdentityValue(opts)
  if (!id) return undefined
  const cols = id.kind === 'id' ? USER_ID_KEYS : USER_NAME_KEYS
  const keys = unique(cols).filter((k) => !skip.has(k))
  return keys.map((k) => `${k} = ${sqlString(id.value)}`).join(' OR ') || undefined
}

function sqlString(value: string): string {
  return `'${value.replaceAll("'", "''")}'`
}

function unique(values: readonly string[]): string[] {
  return [...new Set(values)]
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

function hitToInventoryObservation(kind: InventoryDiscoveryKind, h: Record<string, unknown>): InventoryObservation[] {
  const operationName = String(h.operation_name ?? '')
  const name = kind === 'new_tool' ? extractToolName(operationName) : extractAgentName(operationName)
  if (!name) return []

  const firstSeenNs = Number(h.first_seen ?? 0)
  const lastSeenNs = Number(h.last_seen ?? firstSeenNs)
  return [
    {
      kind: kind === 'new_tool' ? 'mcp_tool' : 'agent',
      name,
      namespace: '',
      firstSeenMs: Math.floor(firstSeenNs / 1_000_000),
      lastSeenMs: Math.floor(lastSeenNs / 1_000_000),
      traceId: typeof h.sample_trace_id === 'string' ? h.sample_trace_id : undefined,
    },
  ]
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

function num(v: unknown): number | undefined {
  if (v === null || v === undefined || v === '') return undefined
  const n = Number(v)
  return Number.isFinite(n) ? n : undefined
}
