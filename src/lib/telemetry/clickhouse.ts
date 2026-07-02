import { createClient } from '@clickhouse/client'
import type { JsonValue } from '#/lib/json'
import {
  dedupeById,
  normalizeRunGraph,
  normalizeTraceRoots,
  propagateInheritedAttrs,
  propagateSessionInTrace,
  type Span,
  type SpanKind,
} from '#/lib/spans'
import { classifySpan, extractAgentName } from '#/lib/spans/classify-span'
import { chCol } from './conventions'
import {
  aggregateSessions,
  buildLogRecord,
  buildTraceSummary,
  classifyError,
  classifySpanRow,
  DEFAULT_LIST_LIMIT,
  firstString,
  groupBy,
  identityFields,
  num,
  PROVIDER_QUERY_TIMEOUT_MS,
  SESSION_SCAN_LIMIT,
  SPAN_ID_RE,
  TRACE_FETCH_LIMIT,
} from './shared'
import type {
  ClickHouseProvider,
  GetTraceOpts,
  IdentityFilter,
  ListSpansOpts,
  ListTracesOpts,
  LogLevel,
  LogRecord,
  SessionFetch,
  SpanSummary,
} from './types'

export interface ClickHouseConfig {
  url: string
  database: string
  username: string
  password: string
  table?: string
  logsTable?: string
}

const DEFAULT_WINDOW_US = 30 * 24 * 60 * 60 * 1_000_000

// Every query is time-bounded (partition pruning) — {from_us}/{to_us} are
// always bound by `query`, so analytics SQL can embed this fragment too.
export const CH_TIME_WHERE =
  'Timestamp >= fromUnixTimestamp64Micro({from_us:Int64}) AND Timestamp < fromUnixTimestamp64Micro({to_us:Int64})'

// shared.ts sqlString doubles quotes only (DataFusion has no backslash
// escapes) — ClickHouse does, so a trailing backslash would defeat it. Inline
// only through this; provider queries bind params instead.
export function chString(value: string): string {
  return `'${value.replaceAll('\\', '\\\\').replaceAll("'", "\\'")}'`
}

// The exporter stores pdata enum strings; older versions used the
// SPAN_KIND_* / STATUS_CODE_* forms — accept both.
export const CH_ERROR_WHERE = "StatusCode IN ('Error', 'STATUS_CODE_ERROR')"
const SPAN_STATUS = `if(${CH_ERROR_WHERE}, 'ERROR', '') AS span_status`

const START_MS = 'toUnixTimestamp64Milli(Timestamp)'
const DURATION_MS = 'intDiv(Duration, 1000000)'

// Aliased to the flattened attr names so shared rollup helpers (pickCanonical
// via bothForms) read them exactly like OpenObserve rows.
const SPAN_SELECT = `
  TraceId AS trace_id,
  SpanId AS span_id,
  ParentSpanId AS parent_span_id,
  SpanName AS operation_name,
  SpanKind AS span_kind,
  ServiceName AS service_name,
  ${START_MS} AS start_ms,
  ${DURATION_MS} AS duration_ms,
  ${SPAN_STATUS},
  StatusMessage AS status_message,
  SessionTitle AS session_title,
  SpanAttributes AS span_attributes,
  ResourceAttributes AS resource_attributes,
  Events.Name AS event_names,
  Events.Attributes AS event_attributes`

export function createClickHouseProvider(cfg: ClickHouseConfig): ClickHouseProvider {
  const table = cfg.table ?? 'otel_traces'
  const logsTable = cfg.logsTable ?? 'otel_logs'
  const client = createClient({
    url: cfg.url,
    database: cfg.database,
    username: cfg.username,
    password: cfg.password,
    request_timeout: PROVIDER_QUERY_TIMEOUT_MS,
  })

  const run = async (sql: string, params: Record<string, unknown> = {}): Promise<Array<Record<string, unknown>>> => {
    const rs = await client.query({
      query: sql,
      query_params: params,
      format: 'JSONEachRow',
      abort_signal: AbortSignal.timeout(PROVIDER_QUERY_TIMEOUT_MS),
    })
    return rs.json<Record<string, unknown>>()
  }

  const fetchSpans = async (traceIds: string[], fromUs: number, toUs: number) =>
    run(
      `SELECT ${SPAN_SELECT} FROM ${table} WHERE TraceId IN {trace_ids:Array(String)} AND ${CH_TIME_WHERE} LIMIT ${TRACE_FETCH_LIMIT}`,
      { trace_ids: traceIds, from_us: fromUs, to_us: toUs },
    )

  // Exact [start,end] from the trace_summary MV (1s pad — CH_TIME_WHERE's
  // upper bound is exclusive). Null when the trace is unknown.
  const summaryWindow = async (traceId: string): Promise<{ fromUs: number; toUs: number } | null> => {
    const rows = await run(
      `SELECT toUnixTimestamp64Micro(min(start)) AS from_us, toUnixTimestamp64Micro(max(end)) AS to_us
       FROM trace_summary WHERE trace_id = {id:String} GROUP BY trace_id`,
      { id: traceId },
    )
    const fromUs = num(rows[0]?.from_us)
    const toUs = num(rows[0]?.to_us)
    if (fromUs === undefined || toUs === undefined) return null
    return { fromUs: fromUs - 1_000_000, toUs: toUs + 1_000_000 }
  }

  return {
    name: 'clickhouse',
    fingerprint: `${cfg.url}/${cfg.database}`,
    table,
    logsTable,

    query: (q, opts) => {
      const { fromUs, toUs } = window(opts)
      return run(q, { from_us: fromUs, to_us: toUs })
    },

    async getTrace(traceId) {
      if (!SPAN_ID_RE.test(traceId)) return null
      let realId = traceId
      let win = await summaryWindow(traceId)
      if (!win) {
        // The id might be a span_id (sub-agent / purpose-span rows).
        const { fromUs, toUs } = window(undefined)
        const lookup = await run(
          `SELECT TraceId AS trace_id FROM ${table} WHERE SpanId = {id:String} AND ${CH_TIME_WHERE} LIMIT 1`,
          { id: traceId, from_us: fromUs, to_us: toUs },
        )
        const resolved = lookup[0]?.trace_id
        if (typeof resolved !== 'string' || !SPAN_ID_RE.test(resolved)) return null
        realId = resolved
        win = await summaryWindow(realId)
      }
      if (!win) return null
      const hits = await fetchSpans([realId], win.fromUs, win.toUs)
      if (hits.length === 0) return null
      const realTraceId = (hits[0]?.trace_id as string) ?? traceId
      const spans = dedupeById(hits.map(normalizeClickHouseRow))
      normalizeTraceRoots(spans)
      propagateSessionInTrace(spans)
      propagateInheritedAttrs(spans)
      normalizeRunGraph(spans)
      return {
        spans,
        truncated: hits.length >= TRACE_FETCH_LIMIT,
        focusSpanId: traceId !== realTraceId ? traceId : undefined,
      }
    },

    async listSessions(opts) {
      const { fromUs, toUs } = window(opts)
      const limit = opts?.limit ?? DEFAULT_LIST_LIMIT
      const identity = whereIdentity(opts)
      const sql = `
        SELECT
          TraceId AS trace_id,
          SpanName AS operation_name,
          SessionId AS ag_ui_thread_id,
          SessionTitle AS ag_ui_thread_title,
          FirstInputPreview AS first_input,
          UserName AS user_name,
          UserId AS user_id,
          Host AS host_name,
          AgentName AS gen_ai_agent_name,
          Model AS gen_ai_request_model,
          Provider AS gen_ai_provider_name,
          ${START_MS} AS start_ms,
          ${START_MS} + ${DURATION_MS} AS end_ms,
          GenAiOperation AS gen_ai_operation_name,
          -- 0 = absent on promoted numerics; NULL routes the shared rollup to
          -- its fallbacks (input+output for total, price estimate for cost).
          nullIf(TotalTokens, 0) AS gen_ai_usage_total_tokens,
          nullIf(InputTokens, 0) AS gen_ai_usage_input_tokens,
          nullIf(OutputTokens, 0) AS gen_ai_usage_output_tokens,
          nullIf(CacheReadTokens, 0) AS gen_ai_usage_cache_read_input_tokens,
          nullIf(CostUsd, 0) AS gen_ai_usage_cost_total,
          TriggerType AS trigger_type,
          ${SPAN_STATUS},
          ServiceName AS service_name
        FROM ${table}
        WHERE (SpanName LIKE 'invoke_agent %'
           OR GenAiOperation = 'chat'
           OR (${CH_ERROR_WHERE} AND (GenAiOperation != '' OR SpanName LIKE 'execute_tool %'))
           OR SessionId != '')
          AND ${CH_TIME_WHERE}
          ${identity.clause}
        ORDER BY Timestamp DESC
        LIMIT ${SESSION_SCAN_LIMIT}
      `
      const hits = await run(sql, { from_us: fromUs, to_us: toUs, ...identity.params })
      return { sessions: aggregateSessions(hits, limit), truncated: hits.length >= SESSION_SCAN_LIMIT }
    },

    async getSession(sessionId, opts): Promise<SessionFetch> {
      if (!SPAN_ID_RE.test(sessionId)) return null
      const { fromUs, toUs } = window(opts)
      const identity = whereIdentity(opts)
      const trHits = await run(
        `SELECT DISTINCT TraceId AS trace_id FROM ${table}
         WHERE (TraceId = {sid:String} OR SessionId = {sid:String}) AND ${CH_TIME_WHERE} ${identity.clause}`,
        { sid: sessionId, from_us: fromUs, to_us: toUs, ...identity.params },
      )
      const traceIds = trHits.map((h) => String(h.trace_id)).filter(Boolean)
      if (traceIds.length === 0) return null
      const spanHits = await fetchSpans(traceIds, fromUs, toUs)
      const spans = dedupeById(spanHits.map(normalizeClickHouseRow))
      for (const trSpans of groupBy(spans, (s) => s.traceId).values()) {
        normalizeTraceRoots(trSpans)
        propagateSessionInTrace(trSpans)
        propagateInheritedAttrs(trSpans)
      }
      const source: 'attribute' | 'trace' = spans.some((s) => s.sessionSource === 'attribute') ? 'attribute' : 'trace'
      const title = spanHits.map((h) => h.session_title).find((t): t is string => typeof t === 'string' && t.length > 0)
      return { sessionId, source, traceIds, spans, title }
    },

    async listTraces(opts) {
      const { fromUs, toUs } = window(opts)
      const limit = opts?.limit ?? DEFAULT_LIST_LIMIT
      // Domain rules live in the trace_list view (init/01-traces.sql); here we
      // only bind the window + service and layer facet filters on its output.
      const filters: string[] = []
      const params: Record<string, unknown> = { from_us: fromUs, to_us: toUs, svc: opts?.serviceName ?? '' }
      if (opts?.triggerTypes?.length) {
        filters.push('root_trigger_type IN {trigger_types:Array(String)}')
        params.trigger_types = opts.triggerTypes
      }
      if (opts?.agentName) {
        filters.push('(sample_agent_name = {agent_name:String} OR sample_agent LIKE {agent_like:String})')
        params.agent_name = opts.agentName
        params.agent_like = `invoke_agent ${opts.agentName}%`
      }
      const sql = `
        SELECT * FROM trace_list(p_from={from_us:Int64}, p_to={to_us:Int64}, p_svc={svc:String})
        ${filters.length ? `WHERE ${filters.join(' AND ')}` : ''}
        ORDER BY first_ms DESC
        LIMIT ${limit}
      `
      const hits = await run(sql, params)
      return hits.map((h) => {
        const firstMs = Number(h.first_ms ?? 0)
        const agentName =
          typeof h.sample_agent_name === 'string' && h.sample_agent_name ? h.sample_agent_name : undefined
        return buildTraceSummary(h, {
          id: String(h.trace_id),
          startedAtMs: firstMs,
          durationMs: Math.max(0, Number(h.last_ms ?? 0) - firstMs),
          hasError: Number(h.has_error ?? 0) === 1,
          agent: agentName ?? extractAgentName(String(h.sample_agent ?? '')),
          totalCostUsd: num(h.total_cost),
        })
      })
    },

    async listSpans(opts): Promise<SpanSummary[]> {
      const { fromUs, toUs } = window(opts)
      const limit = opts?.limit ?? DEFAULT_LIST_LIMIT
      const identity = whereIdentity(opts)
      const sql = `
        SELECT
          SpanId AS span_id,
          TraceId AS trace_id,
          SpanName AS span_name,
          Purpose AS purpose,
          ${START_MS} AS start_ms,
          ${DURATION_MS} AS duration_ms,
          if(TotalTokens > 0, TotalTokens, InputTokens + OutputTokens) AS total_tokens,
          CostUsd AS cost_usd,
          Model AS model_id,
          AgentName AS agent_name,
          ${SPAN_STATUS},
          UserId AS user_id,
          UserName AS user_name
        FROM ${table}
        WHERE ((SpanName LIKE 'invoke_agent %' AND ParentSpanId IN (
                SELECT SpanId FROM ${table} WHERE SpanName LIKE 'execute_tool %' AND ${CH_TIME_WHERE}
              ))
            OR (Purpose != '' AND ParentSpanId != '')
            OR TaskParentId != '')
          AND ${CH_TIME_WHERE}
          ${identity.clause}
        ORDER BY Timestamp DESC
        LIMIT ${limit}
      `
      const hits = await run(sql, { from_us: fromUs, to_us: toUs, ...identity.params })
      return hits.map(hitToSpanSummary)
    },

    async listLogs(opts) {
      if (opts.traceIds.length === 0) return []
      const { fromUs, toUs } = window({ fromUs: opts.fromUs, toUs: opts.toUs })
      const sql = `
        SELECT
          toUnixTimestamp64Milli(Timestamp) AS ts_ms,
          TraceId AS trace_id,
          SpanId AS span_id,
          SeverityText AS severity_text,
          SeverityNumber AS severity_number,
          ServiceName AS service_name,
          ScopeName AS scope_name,
          Body AS body,
          LogAttributes AS log_attributes
        FROM ${logsTable}
        WHERE TraceId IN {trace_ids:Array(String)} AND ${CH_TIME_WHERE}
        ORDER BY Timestamp ASC
        LIMIT ${opts.limit ?? 1000}
      `
      const hits = await run(sql, { trace_ids: opts.traceIds, from_us: fromUs, to_us: toUs })
      return hits.map(chHitToLogRecord)
    },
  }
}

function window(opts: GetTraceOpts | ListTracesOpts | ListSpansOpts | undefined): { fromUs: number; toUs: number } {
  const toUs = opts?.toUs ?? Date.now() * 1000
  const fromUs = opts?.fromUs ?? toUs - DEFAULT_WINDOW_US
  return { fromUs, toUs }
}

// Identity values come from URL params — bound, never inlined.
function whereIdentity(opts: IdentityFilter | undefined): { clause: string; params: Record<string, unknown> } {
  const params: Record<string, unknown> = {}
  const clauses = identityFields(opts).map(({ field, value }, i) => {
    params[`ident_${i}`] = value
    return `${chCol(field)} = {ident_${i}:String}`
  })
  return { clause: clauses.length === 0 ? '' : `AND ${clauses.join(' AND ')}`, params }
}

function hitToSpanSummary(h: Record<string, unknown>): SpanSummary {
  const spanName = String(h.span_name ?? '')
  const purpose = typeof h.purpose === 'string' ? h.purpose : ''
  const agentName = typeof h.agent_name === 'string' ? h.agent_name : ''
  const { kind, label } = classifySpanRow(spanName, purpose, agentName)
  const summary: SpanSummary = {
    spanId: String(h.span_id ?? ''),
    traceId: String(h.trace_id ?? ''),
    spanName,
    kind,
    label,
    startedAtMs: Number(h.start_ms ?? 0),
    durationMs: Math.max(0, Number(h.duration_ms ?? 0)),
  }
  const tokens = num(h.total_tokens)
  if (tokens) summary.totalTokens = tokens
  const cost = num(h.cost_usd)
  if (cost) summary.totalCostUsd = cost
  if (typeof h.model_id === 'string' && h.model_id) summary.modelId = h.model_id
  if (h.span_status === 'ERROR') summary.hasError = true
  if (typeof h.user_id === 'string' && h.user_id) summary.userId = h.user_id
  if (typeof h.user_name === 'string' && h.user_name) summary.userName = h.user_name
  return summary
}

function exceptionFromEvents(
  names: unknown,
  attrs: unknown,
): { type?: string; message?: string; stack?: string } | undefined {
  if (!Array.isArray(names) || !Array.isArray(attrs)) return undefined
  const i = names.indexOf('exception')
  if (i < 0) return undefined
  const a = attrs[i]
  if (!a || typeof a !== 'object') return undefined
  const e = a as Record<string, unknown>
  const pick = (k: string): string | undefined => (typeof e[k] === 'string' && e[k] ? (e[k] as string) : undefined)
  return {
    type: pick('exception.type'),
    message: pick('exception.message'),
    stack: pick('exception.stacktrace'),
  }
}

// Rows come from SPAN_SELECT: promoted timing/status plus the raw attr maps.
// classifySpan reads the merged dotted-key bag exactly as the SDK emitted it.
export function normalizeClickHouseRow(h: Record<string, unknown>): Span {
  const attrs: Record<string, unknown> = {
    ...((h.resource_attributes as Record<string, unknown>) ?? {}),
    ...((h.span_attributes as Record<string, unknown>) ?? {}),
  }
  const operationName = String(h.operation_name ?? '?')
  const startMs = Number(h.start_ms ?? 0)
  const endMs = startMs + Math.max(0, Number(h.duration_ms ?? 0))
  const failed = h.span_status === 'ERROR'
  const exc = exceptionFromEvents(h.event_names, h.event_attributes)
  const { errorType, errorMessage } = classifyError({
    failed,
    errorType: firstString(attrs, ['exception.type', 'error.type']) ?? exc?.type,
    errorMessage:
      firstString(attrs, ['exception.message', 'error.message']) ??
      exc?.message ??
      (failed ? firstString(h, ['status_message']) : undefined),
    httpStatus: firstString(attrs, ['http.response.status_code', 'http.status_code']),
  })
  const stack = firstString(attrs, ['exception.stacktrace']) ?? exc?.stack
  return {
    id: String(h.span_id),
    traceId: String(h.trace_id ?? ''),
    parentId: (h.parent_span_id as string) || null,
    service: String(h.service_name ?? 'unknown'),
    kind: kindFromString(h.span_kind),
    name: operationName,
    startMs,
    endMs,
    ...(failed ? { hasError: true } : {}),
    ...(errorType ? { errorType } : {}),
    ...(errorMessage ? { errorMessage } : {}),
    ...(stack ? { errorStack: stack } : {}),
    ...classifySpan(operationName, attrs, startMs),
    rawAttributes: attrs as Record<string, JsonValue>,
  }
}

function kindFromString(raw: unknown): SpanKind {
  switch (
    String(raw ?? '')
      .toLowerCase()
      .replace('span_kind_', '')
  ) {
    case 'server':
      return 'server'
    case 'client':
      return 'client'
    case 'producer':
      return 'producer'
    case 'consumer':
      return 'consumer'
    default:
      return 'internal'
  }
}

function chHitToLogRecord(h: Record<string, unknown>): LogRecord {
  const attributes: Record<string, unknown> = {
    ...((h.log_attributes as Record<string, unknown>) ?? {}),
    service_name: h.service_name,
    severity: h.severity_text,
  }
  return buildLogRecord({
    timestampMs: Number(h.ts_ms ?? 0),
    level: chLogLevel(h),
    message: typeof h.body === 'string' ? h.body : '',
    source: firstString(h, ['scope_name', 'service_name']),
    traceId: typeof h.trace_id === 'string' && h.trace_id ? h.trace_id : undefined,
    spanId: typeof h.span_id === 'string' && h.span_id ? h.span_id : undefined,
    attributes,
  })
}

function chLogLevel(h: Record<string, unknown>): LogLevel {
  const s = (typeof h.severity_text === 'string' ? h.severity_text : '').toLowerCase()
  if (s === 'trace') return 'trace'
  if (s === 'debug') return 'debug'
  if (s === 'warn' || s === 'warning') return 'warn'
  if (s === 'error' || s === 'err') return 'error'
  if (s === 'fatal' || s === 'critical' || s === 'crit') return 'fatal'
  if (s) return 'info'
  const n = Number(h.severity_number ?? 0)
  if (n >= 21) return 'fatal'
  if (n >= 17) return 'error'
  if (n >= 13) return 'warn'
  if (n >= 9) return 'info'
  if (n >= 5) return 'debug'
  if (n >= 1) return 'trace'
  return 'info'
}
