import { errMessage } from '#/lib/format'
import { type JsonValue, parseJson } from '#/lib/json'
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
import { ooCoalesceAs, ooCol, ooColumns } from './conventions'
import {
  aggregateSessions,
  buildLogRecord,
  buildTraceSummary,
  classifyError,
  classifySpanRow,
  firstString,
  groupBy,
  num,
  pickIdentityValue,
  SESSION_SCAN_LIMIT,
  TRACE_FETCH_LIMIT,
} from './shared'
import type {
  GetTraceOpts,
  ListSpansOpts,
  ListTracesOpts,
  LogLevel,
  LogRecord,
  OpenObserveProvider,
  SessionFetch,
  SpanSummary,
} from './types'

export interface OpenObserveConfig {
  baseUrl: string
  org: string
  stream: string
  user: string
  password: string
  // Stream that holds application logs (separate from the traces stream). OO
  // defaults to `default` for logs ingest, so that's the fallback.
  logsStream?: string
}

const DEFAULT_LIST_LIMIT = 50
// Last 30 days — OO scans local Parquet, cost ~free.
const DEFAULT_WINDOW_US = 30 * 24 * 60 * 60 * 1_000_000
// Bound stalled scans (else an infinite spinner with no error).
const FETCH_TIMEOUT_MS = 120_000

// OO-specific column quirks: alternate `_o2_*` forms exist when an attribute
// collided with a reserved name at ingest. Not OTel attributes — kept here
// rather than polluting the convention table.
const LLM_INPUT_EXTRAS = ['_o2_llm_input']
const LLM_COST_EXTRAS = ['_o2_llm_cost_details_total']

// Per-row chat-span token expression. OTel GenAI semconv splits usage into
// input/output and treats total_tokens as derived; producers (MAF, OpenLLMetry,
// Pydantic AI) routinely emit only input+output. Prefer the producer-emitted
// total when present, otherwise compute input+output. Returns '0' when none of
// the columns exist in the stream schema, so a SUM over the expression stays
// well-typed.
// SQL helper: MAX() over any of the candidate columns, COALESCE'd. Returns
// 'NULL' when none of the columns exist in the stream's schema.
function maxOf(cols: readonly string[]): string {
  if (cols.length === 0) return 'NULL'
  if (cols.length === 1) return `MAX(${cols[0]})`
  return `COALESCE(${cols.map((c) => `MAX(${c})`).join(', ')})`
}

const coalesce = (cols: readonly string[]): string => (cols.length === 1 ? cols[0] : `COALESCE(${cols.join(', ')})`)

// SUM() of `cols` restricted to chat-op rows. Returns '0' when no candidate
// columns are present.
function sumChatOf(cols: readonly string[]): string {
  if (cols.length === 0) return '0'
  return `SUM(CASE WHEN gen_ai_operation_name = 'chat' THEN ${coalesce(cols)} ELSE 0 END)`
}

function chatTokensExpr(known: ReadonlySet<string>): string {
  const total = ooColumns('totalTokens', { known })
  const input = ooColumns('inputTokens', { known })
  const output = ooColumns('outputTokens', { known })
  const totalExpr = total.length === 0 ? null : coalesce(total)
  const ioParts: string[] = []
  if (input.length) ioParts.push(`COALESCE(${[...input, '0'].join(', ')})`)
  if (output.length) ioParts.push(`COALESCE(${[...output, '0'].join(', ')})`)
  const ioExpr = ioParts.length ? ioParts.join(' + ') : null
  if (totalExpr && ioExpr) return `COALESCE(${totalExpr}, ${ioExpr})`
  return totalExpr ?? ioExpr ?? '0'
}

const SCHEMA_TTL_MS = 5 * 60 * 1000

export function createOpenObserveProvider(cfg: OpenObserveConfig): OpenObserveProvider {
  const auth = btoa(`${cfg.user}:${cfg.password}`)

  let schemaCache: { cols: Set<string>; at: number } | undefined
  const getKnownColumns = async (): Promise<Set<string>> => {
    if (schemaCache && Date.now() - schemaCache.at < SCHEMA_TTL_MS) return schemaCache.cols
    const resp = await fetch(`${cfg.baseUrl}/api/${cfg.org}/streams/${cfg.stream}/schema?type=traces`, {
      headers: { Authorization: `Basic ${auth}` },
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    })
    const cols = new Set<string>()
    if (resp.ok) {
      const data = (await resp.json()) as { schema?: Array<{ name: string }> }
      for (const c of data.schema ?? []) cols.add(c.name)
    }
    schemaCache = { cols, at: Date.now() }
    return cols
  }
  const forgetSchema = () => {
    schemaCache = undefined
  }

  const search = async (
    sql: string,
    fromUs: number,
    toUs: number,
    size = TRACE_FETCH_LIMIT,
    type: 'traces' | 'logs' = 'traces',
  ): Promise<Array<Record<string, unknown>>> => {
    const body = JSON.stringify({
      query: { sql, start_time: fromUs, end_time: toUs, from: 0, size },
    })
    const resp = await fetch(`${cfg.baseUrl}/api/${cfg.org}/_search?type=${type}`, {
      method: 'POST',
      headers: { Authorization: `Basic ${auth}`, 'Content-Type': 'application/json' },
      body,
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
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

  // 20004 = column referenced in SQL doesn't exist in stream schema. Drop the
  // cache and retry once with a fresh probe — handles columns that appeared
  // after our cache was warmed.
  const runWithSchema = async <T>(run: (known: ReadonlySet<string>) => Promise<T>): Promise<T> => {
    try {
      return await run(await getKnownColumns())
    } catch (e) {
      const msg = errMessage(e)
      if (!msg.includes('"code":20004')) throw e
      forgetSchema()
      return await run(await getKnownColumns())
    }
  }

  return {
    name: 'openobserve',
    fingerprint: `${cfg.baseUrl}/${cfg.org}`,
    stream: cfg.stream,

    query: (q, opts) =>
      search(q, opts.fromUs ?? Date.now() * 1000 - DEFAULT_WINDOW_US, opts.toUs ?? Date.now() * 1000, opts.size),

    getKnownColumns,

    async getTrace(traceId, opts) {
      if (!/^[A-Za-z0-9_-]+$/.test(traceId)) return null
      const { fromUs, toUs } = window(opts)
      let sql = `SELECT * FROM "${cfg.stream}" WHERE trace_id='${traceId}'`
      let hits = await search(sql, fromUs, toUs)
      // If no results, the id might be a span_id (from sub-agent or purpose-span rows).
      if (hits.length === 0) {
        const lookupSql = `SELECT trace_id FROM "${cfg.stream}" WHERE span_id='${traceId}' LIMIT 1`
        const lookupHits = await search(lookupSql, fromUs, toUs)
        const resolved = lookupHits[0]?.trace_id as string | undefined
        if (resolved && /^[A-Za-z0-9_-]+$/.test(resolved)) {
          sql = `SELECT * FROM "${cfg.stream}" WHERE trace_id='${resolved}'`
          hits = await search(sql, fromUs, toUs)
        }
      }
      if (hits.length === 0) return null
      const realTraceId = (hits[0]?.trace_id as string) ?? traceId
      const spans = dedupeById(hits.map(normalizeOpenObserveHit))
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
      // Pull every row needed to (a) resolve a trace's session id and (b)
      // roll up its tokens/cost. Group by trace in TS, then by session.
      const buildSql = (known: ReadonlySet<string>) => {
        const sessionCols = ooColumns('sessionId', { known })
        return `
        SELECT
          trace_id,
          span_id,
          reference_parent_span_id,
          operation_name,
          ${ooCoalesceAs('sessionId', 'ag_ui_thread_id', { known })},
          ${ooCoalesceAs('sessionTitle', 'ag_ui_thread_title', { known })},
          ${ooCoalesceAs('llmInput', 'gen_ai_input_messages', { known, extras: LLM_INPUT_EXTRAS })},
          ${ooCoalesceAs('userName', 'user_name', { known })},
          ${ooCoalesceAs('userId', 'user_id', { known })},
          ${ooCoalesceAs('host', 'host_name', { known })},
          start_time / 1000000 AS start_ms,
          end_time / 1000000 AS end_ms,
          gen_ai_operation_name,
          ${ooCoalesceAs('totalTokens', 'gen_ai_usage_total_tokens', { known })},
          ${ooCoalesceAs('costUsd', 'gen_ai_usage_cost_total', { known, extras: LLM_COST_EXTRAS })},
          ${ooCoalesceAs('inputTokens', 'gen_ai_usage_input_tokens', { known })},
          ${ooCoalesceAs('outputTokens', 'gen_ai_usage_output_tokens', { known })},
          ${ooCol('triggerType', known)} AS trigger_type,
          span_status,
          service_name
        FROM "${cfg.stream}"
        WHERE (
          operation_name LIKE 'invoke_agent %'
          OR gen_ai_operation_name = 'chat'
          ${sessionCols.map((c) => `OR ${c} != ''`).join('\n          ')}
        )
        ${whereIdentity(opts, known)}
        ORDER BY start_time DESC
        LIMIT ${SESSION_SCAN_LIMIT}
      `
      }
      const hits = await runWithSchema((known) => search(buildSql(known), fromUs, toUs, SESSION_SCAN_LIMIT))
      const truncated = hits.length >= SESSION_SCAN_LIMIT
      return { sessions: aggregateSessions(hits, limit), truncated }
    },

    async getSession(sessionId, opts): Promise<SessionFetch> {
      if (!/^[A-Za-z0-9_-]+$/.test(sessionId)) return null
      const { fromUs, toUs } = window(opts)
      const buildTraceSql = (known: ReadonlySet<string>) => {
        // Fallback sessions are just the trace id — always include.
        const clauses: string[] = [`trace_id = '${sessionId}'`]
        for (const col of ooColumns('sessionId', { known })) {
          clauses.push(`${col} = '${sessionId}'`)
        }
        return `SELECT DISTINCT trace_id FROM "${cfg.stream}" WHERE (${clauses.join(' OR ')}) ${whereIdentity(opts, known)}`
      }
      const trHits = await runWithSchema((known) => search(buildTraceSql(known), fromUs, toUs))
      const traceIds = trHits.map((h) => String(h.trace_id)).filter(Boolean)
      if (traceIds.length === 0) return null
      const idList = traceIds.map((id) => `'${id}'`).join(',')
      const spanHits = await search(`SELECT * FROM "${cfg.stream}" WHERE trace_id IN (${idList})`, fromUs, toUs)
      const spans = dedupeById(spanHits.map(normalizeOpenObserveHit))
      for (const trSpans of groupBy(spans, (s) => s.traceId).values()) {
        normalizeTraceRoots(trSpans)
        propagateSessionInTrace(trSpans)
        propagateInheritedAttrs(trSpans)
      }
      const source: 'attribute' | 'trace' = spans.some((s) => s.sessionSource === 'attribute') ? 'attribute' : 'trace'
      const titleCols = ooColumns('sessionTitle')
      let title: string | undefined
      for (const h of spanHits) {
        for (const col of titleCols) {
          const v = h[col]
          if (typeof v === 'string' && v.trim()) {
            title = v.trim()
            break
          }
        }
        if (title) break
      }
      return { sessionId, source, traceIds, spans, title }
    },

    async listTraces(opts) {
      const { fromUs, toUs } = window(opts)
      const limit = opts?.limit ?? DEFAULT_LIST_LIMIT
      // Tokens / cost from chat spans only — agent spans roll up the same
      // numbers, so summing all spans would double-count.
      const buildSql = (known: ReadonlySet<string>) => {
        const sessionCols = ooColumns('sessionId', { known })
        const costCols = ooColumns('costUsd', { known, extras: LLM_COST_EXTRAS })
        const uidCols = ooColumns('userId', { known })
        const unameCols = ooColumns('userName', { known })
        const agentExpr = `MAX(CASE WHEN operation_name LIKE 'invoke_agent %' THEN operation_name END)`
        const rootTriggerExpr = `COALESCE(
            MAX(CASE WHEN reference_parent_span_id IS NULL THEN ${ooCol('triggerType', known)} END),
            MAX(CASE WHEN operation_name LIKE 'invoke_agent %' AND ${ooCol('triggerType', known)} IS NOT NULL THEN ${ooCol('triggerType', known)} END)
          )`
        const serviceWhere = opts?.serviceName ? `AND service_name = ${sqlString(opts.serviceName)}` : ''
        const having: string[] = []
        if (opts?.triggerTypes?.length) {
          having.push(`${rootTriggerExpr} IN (${opts.triggerTypes.map(sqlString).join(', ')})`)
        }
        if (opts?.agentName) having.push(`${agentExpr} LIKE ${sqlString(`invoke_agent ${opts.agentName}%`)}`)
        return `
        SELECT
          trace_id,
          MIN(start_time) AS first_seen,
          MAX(end_time)   AS last_seen,
          COUNT(*)        AS span_count,
          SUM(CASE WHEN gen_ai_operation_name = 'chat' THEN ${chatTokensExpr(known)} ELSE 0 END) AS total_tokens,
          ${sumChatOf(costCols)} AS total_cost,
          ${agentExpr} AS sample_agent,
          MAX(CASE WHEN span_status = 'ERROR' AND (gen_ai_operation_name IS NOT NULL OR operation_name LIKE 'invoke_agent %' OR operation_name LIKE 'execute_tool %') THEN 1 ELSE 0 END) AS has_error,
          ${maxOf(sessionCols)} AS session_id,
          MAX(service_name)    AS service_name,
          MAX(CASE WHEN operation_name LIKE 'invoke_agent %' THEN 1 ELSE 0 END) AS has_invoke_agent,
          MAX(CASE WHEN gen_ai_operation_name = 'chat' THEN 1 ELSE 0 END) AS has_chat,
          MAX(CASE WHEN reference_parent_span_id IS NULL THEN ${ooCol('llmPurpose', known)} END) AS root_llm_purpose,
          ${rootTriggerExpr} AS root_trigger_type,
          COALESCE(
            MAX(CASE WHEN reference_parent_span_id IS NULL THEN ${ooCol('execution', known)} END),
            MAX(CASE WHEN operation_name LIKE 'invoke_agent %' AND ${ooCol('execution', known)} IS NOT NULL THEN ${ooCol('execution', known)} END)
          ) AS root_execution,
          MAX(CASE WHEN reference_parent_span_id IS NULL THEN ${ooCol('taskId', known)} END) AS root_task_id,
          MAX(CASE WHEN reference_parent_span_id IS NULL THEN ${ooCol('taskKind', known)} END) AS root_task_kind,
          MAX(CASE WHEN reference_parent_span_id IS NULL THEN ${ooCol('taskSchedule', known)} END) AS root_task_schedule,
          MAX(CASE WHEN reference_parent_span_id IS NULL THEN ${ooCol('taskName', known)} END) AS root_task_name,
          MAX(CASE WHEN reference_parent_span_id IS NULL THEN ${ooCol('taskSource', known)} END) AS root_task_source,
          MAX(CASE WHEN reference_parent_span_id IS NULL THEN operation_name END) AS root_operation,
          ${maxOf(uidCols)} AS trace_user_id,
          ${maxOf(unameCols)} AS trace_user_name
        FROM "${cfg.stream}"
        WHERE (gen_ai_operation_name IS NOT NULL
           OR operation_name LIKE 'invoke_agent %'
           OR operation_name LIKE 'execute_tool %'
           OR ${ooCol('triggerType', known)} IS NOT NULL
           OR ${ooCol('llmPurpose', known)} IS NOT NULL)
          AND operation_name NOT LIKE 'tools/%'
          ${serviceWhere}
        GROUP BY trace_id
        ${having.length ? `HAVING ${having.join(' AND ')}` : ''}
        ORDER BY first_seen DESC
        LIMIT ${limit}
      `
      }
      const hits = await runWithSchema((known) => search(buildSql(known), fromUs, toUs, limit))
      return hits.map(hitToSummary)
    },

    async listSpans(opts): Promise<SpanSummary[]> {
      const { fromUs, toUs } = window(opts)
      const limit = opts?.limit ?? DEFAULT_LIST_LIMIT
      // Sub-agent rows = invoke_agent spans whose parent is an execute_tool span
      // (the "agent as tool" pattern). Identified by span_id IN (...) rather than
      // by a producer-stamped attribute, because MAF / OpenLLMetry don't yet
      // emit gen_ai.task.parent.id and we follow the Langfuse-style approach of
      // walking structure on the consumer side. Utility rows = purpose-tagged
      // non-root spans (gen_ai.operation.purpose).
      const buildSql = (known: ReadonlySet<string>) => {
        // Schema-guarded: missing column → empty, so the query plans not 400s.
        const nativeSubagent = ooColumns('taskParentId', { known })
          .map((c) => `${c} IS NOT NULL`)
          .join(' OR ')
        return `
        SELECT
          span_id,
          trace_id,
          operation_name AS span_name,
          ${ooCoalesceAs('llmPurpose', 'purpose', { known })},
          start_time,
          end_time,
          ${ooCoalesceAs('totalTokens', 'total_tokens', { known })},
          ${ooCoalesceAs('costUsd', 'cost_usd', { known, extras: LLM_COST_EXTRAS })},
          ${ooCoalesceAs('model', 'model_id', { known })},
          span_status,
          ${ooCoalesceAs('userId', 'user_id', { known })},
          ${ooCoalesceAs('userName', 'user_name', { known })}
        FROM "${cfg.stream}"
        WHERE ((operation_name LIKE 'invoke_agent %'
                AND reference_parent_span_id IN (
                  SELECT span_id FROM "${cfg.stream}" WHERE operation_name LIKE 'execute_tool %'
                ))
            OR (${ooCol('llmPurpose', known)} IS NOT NULL AND reference_parent_span_id IS NOT NULL)${nativeSubagent ? `\n            OR (${nativeSubagent})` : ''})
        ${whereIdentity(opts, known)}
        ORDER BY start_time DESC
        LIMIT ${limit}
      `
      }
      const hits = await runWithSchema((known) => search(buildSql(known), fromUs, toUs, limit))
      return hits.map(hitToSpanSummary)
    },

    async listLogs(opts) {
      if (opts.traceIds.length === 0) return []
      const { fromUs, toUs } = window({ fromUs: opts.fromUs, toUs: opts.toUs })
      const idList = opts.traceIds.map(sqlString).join(', ')
      const sql = `SELECT * FROM "${cfg.logsStream ?? 'default'}" WHERE trace_id IN (${idList}) ORDER BY _timestamp ASC`
      const hits = await search(sql, fromUs, toUs, opts.limit ?? 1000, 'logs')
      return hits.map(ooHitToLogRecord)
    },
  }
}

function window(opts: GetTraceOpts | ListTracesOpts | ListSpansOpts | undefined): { fromUs: number; toUs: number } {
  const toUs = opts?.toUs ?? Date.now() * 1000
  const fromUs = opts?.fromUs ?? toUs - DEFAULT_WINDOW_US
  return { fromUs, toUs }
}

// Returns a clause that can be appended directly after an existing WHERE.
// Empty when no identity is requested. `AND 1=0` when an identity is requested
// but no schema column carries it — preserves the "show nothing" intent.
function whereIdentity(opts: { userId?: string; userName?: string } | undefined, known: ReadonlySet<string>): string {
  const id = pickIdentityValue(opts)
  if (!id) return ''
  const cols = ooColumns(id.kind === 'id' ? 'userId' : 'userName', { known })
  if (cols.length === 0) return 'AND 1 = 0'
  const ors = cols.map((k) => `${k} = ${sqlString(id.value)}`).join(' OR ')
  return `AND (${ors})`
}

function sqlString(value: string): string {
  return `'${value.replaceAll("'", "''")}'`
}

function hitToSpanSummary(h: Record<string, unknown>): SpanSummary {
  const startNs = Number(h.start_time ?? 0)
  const endNs = Number(h.end_time ?? 0)
  const spanName = String(h.span_name ?? '')
  const purpose = typeof h.purpose === 'string' ? h.purpose : ''
  const { kind, label } = classifySpanRow(spanName, purpose)
  const summary: SpanSummary = {
    spanId: String(h.span_id ?? ''),
    traceId: String(h.trace_id ?? ''),
    spanName,
    kind,
    label,
    startedAtMs: Math.floor(startNs / 1_000_000),
    durationMs: Math.max(0, Math.floor((endNs - startNs) / 1_000_000)),
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

function hitToSummary(h: Record<string, unknown>): ReturnType<typeof buildTraceSummary> {
  const firstSeenNs = Number(h.first_seen ?? 0)
  const lastSeenNs = Number(h.last_seen ?? 0)
  return buildTraceSummary(h, {
    id: String(h.trace_id),
    startedAtMs: Math.floor(firstSeenNs / 1_000_000),
    durationMs: Math.max(0, Math.floor((lastSeenNs - firstSeenNs) / 1_000_000)),
    hasError: Number(h.has_error ?? 0) === 1,
    agent: extractAgentName(String(h.sample_agent ?? '')) || undefined,
    totalCostUsd: num(h.total_cost),
  })
}

// A raised tool's message/stacktrace live only in the OTel `exception` span
// event (OO serializes the events array as a JSON string), not top-level columns.
function exceptionEvent(raw: unknown): { type?: string; message?: string; stack?: string } | undefined {
  const arr = typeof raw === 'string' ? parseJson(raw) : raw
  if (!Array.isArray(arr)) return undefined
  for (const ev of arr) {
    if (!ev || typeof ev !== 'object' || (ev as Record<string, unknown>).name !== 'exception') continue
    const e = ev as Record<string, unknown>
    const pick = (k: string): string | undefined => (typeof e[k] === 'string' && e[k] ? (e[k] as string) : undefined)
    return {
      type: pick('exception.type') ?? pick('exception_type'),
      message: pick('exception.message') ?? pick('exception_message'),
      stack: pick('exception.stacktrace') ?? pick('exception_stacktrace'),
    }
  }
  return undefined
}

// OpenObserve flattens span attributes into top-level row fields (underscore
// form: `gen_ai_request_model`, `llm_usage_tokens_total`, ...). classifySpan
// reads whatever Record we hand it, so we pass the whole hit.
export function normalizeOpenObserveHit(h: Record<string, unknown>): Span {
  const operationName = String(h.operation_name ?? '?')
  // OpenObserve stores start_time/end_time in nanoseconds. Normalize to ms.
  const startMs = Math.floor(Number(h.start_time ?? 0) / 1_000_000)
  const endMs = Math.floor(Number(h.end_time ?? 0) / 1_000_000)
  const failed = h.span_status === 'ERROR'
  // OO indexers vary between dot and underscore field names — try both.
  const exc = exceptionEvent(h.events)
  const cdStack = firstString(h, ['exception.stacktrace', 'exception_stacktrace']) ?? exc?.stack
  const { errorType, errorMessage } = classifyError({
    failed,
    errorType: firstString(h, ['exception.type', 'exception_type', 'error.type', 'error_type']) ?? exc?.type,
    errorMessage:
      firstString(h, ['exception.message', 'exception_message', 'error.message', 'error_message']) ??
      exc?.message ??
      (failed ? firstString(h, ['status_message']) : undefined),
    httpStatus: firstString(h, [
      'http.response.status_code',
      'http_response_status_code',
      'http.status_code',
      'http_status_code',
    ]),
  })
  return {
    id: String(h.span_id),
    traceId: String(h.trace_id ?? ''),
    parentId: (h.reference_parent_span_id as string) || null,
    service: String(h.service_name ?? 'unknown'),
    kind: kindFromNumber(h.span_kind),
    name: operationName,
    startMs,
    endMs,
    ...(failed ? { hasError: true } : {}),
    ...(errorType ? { errorType } : {}),
    ...(errorMessage ? { errorMessage } : {}),
    ...(cdStack ? { errorStack: cdStack } : {}),
    ...classifySpan(operationName, h, startMs),
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

function ooHitToLogRecord(h: Record<string, unknown>): LogRecord {
  const timestampMs = Math.floor((num(h._timestamp) ?? 0) / 1000)
  return buildLogRecord({
    timestampMs,
    level: normalizeOoLogLevel(h),
    message: firstString(h, ['message', 'body', 'log', 'msg']) ?? '',
    source: firstString(h, ['service_name', 'service', 'logger', 'logger_name', 'host_name']),
    traceId: typeof h.trace_id === 'string' ? h.trace_id : undefined,
    spanId: typeof h.span_id === 'string' ? h.span_id : undefined,
    attributes: h,
  })
}

function normalizeOoLogLevel(h: Record<string, unknown>): LogLevel {
  const s = (firstString(h, ['level', 'severity_text', 'severity', 'log.level']) ?? '').toLowerCase()
  if (s === 'trace') return 'trace'
  if (s === 'debug') return 'debug'
  if (s === 'warn' || s === 'warning') return 'warn'
  if (s === 'error' || s === 'err') return 'error'
  if (s === 'fatal' || s === 'critical' || s === 'crit') return 'fatal'
  return 'info'
}
