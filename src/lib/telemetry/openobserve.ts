import { classifySpan, extractAgentName } from '#/lib/classify-span'
import type { JsonValue } from '#/lib/json'
import {
  dedupeById,
  normalizeTraceRoots,
  propagateInheritedAttrs,
  propagateSessionInTrace,
  type Span,
  type SpanKind,
} from '#/lib/spans'
import { type CanonicalField, ooCoalesceAs, ooColumns } from './conventions'
import { readFieldConfig } from './field-config'
import {
  aggregateSessions,
  groupBy,
  mapLatencyRow,
  mapToolErrorRow,
  mapToolPayloadRow,
  num,
  pickIdentityValue,
} from './shared'
import { classifyTraceCategory } from './trace-category'
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

// OO-specific column quirks: alternate `_o2_*` forms exist when an attribute
// collided with a reserved name at ingest. Not OTel attributes — kept here
// rather than polluting the convention table.
const LLM_INPUT_EXTRAS = ['_o2_llm_input']
const LLM_COST_EXTRAS = ['_o2_llm_cost_details_total']

export function createOpenObserveProvider(cfg: OpenObserveConfig): TelemetryProvider {
  // sessionKind/llmPurpose are deployment-specific, not OTel — stay in field-config.
  const { sessionKindField, llmPurposeField } = readFieldConfig()
  const sessionKindCol = sessionKindField?.replace(/\./g, '_')
  const llmPurposeCol = llmPurposeField?.replace(/\./g, '_')
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
      const spans = dedupeById(hits.map(normalizeOpenObserveHit))
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
        const userPredicate = identityPredicate(opts, skip)
        const sessionCols = ooColumns('sessionId', { skip })
        return `
        SELECT
          trace_id,
          span_id,
          reference_parent_span_id,
          operation_name,
          ${ooCoalesceAs('sessionId', 'ag_ui_thread_id', { skip })},
          ${ooCoalesceAs('sessionTitle', 'ag_ui_thread_title', { skip })},
          ${ooCoalesceAs('llmInput', 'llm_input', { skip, extras: LLM_INPUT_EXTRAS })},
          ${ooCoalesceAs('userName', 'user_name', { skip })},
          ${ooCoalesceAs('userId', 'user_id', { skip })},
          ${ooCoalesceAs('host', 'host_name', { skip })},
          start_time,
          end_time,
          gen_ai_operation_name,
          ${ooCoalesceAs('totalTokens', 'llm_usage_tokens_total', { skip })},
          ${ooCoalesceAs('costUsd', 'llm_usage_cost_total', { skip, extras: LLM_COST_EXTRAS })},
          ${ooCoalesceAs('inputTokens', 'gen_ai_usage_input_tokens', { skip })},
          ${ooCoalesceAs('outputTokens', 'gen_ai_usage_output_tokens', { skip })},
          span_status,
          service_name
        FROM "${cfg.stream}"
        WHERE (
          operation_name LIKE 'invoke_agent %'
          OR gen_ai_operation_name = 'chat'
          ${sessionCols.map((c) => `OR ${c} != ''`).join('\n          ')}
        )
        ${userPredicate ? `AND (${userPredicate})` : opts?.userId || opts?.userName ? 'AND 1 = 0' : ''}
        ORDER BY start_time DESC
        LIMIT ${SESSION_SCAN_LIMIT}
      `
      }
      const hits = await searchDroppingMissing(
        (skip) => search(buildSql(skip), fromUs, toUs, SESSION_SCAN_LIMIT),
        allOptionalCols(
          [
            'sessionId',
            'sessionTitle',
            'llmInput',
            'userName',
            'userId',
            'host',
            'totalTokens',
            'costUsd',
            'inputTokens',
            'outputTokens',
          ],
          { llmInput: LLM_INPUT_EXTRAS, costUsd: LLM_COST_EXTRAS },
        ),
      )
      const truncated = hits.length >= SESSION_SCAN_LIMIT
      return { sessions: aggregateSessions(hits, limit), truncated }
    },

    async getSession(sessionId, opts): Promise<SessionFetch> {
      if (!/^[A-Za-z0-9_-]+$/.test(sessionId)) return null
      const { fromUs, toUs } = window(opts)
      const buildTraceSql = (skip: ReadonlySet<string>) => {
        // Fallback sessions are just the trace id — always include.
        const clauses: string[] = [`trace_id = '${sessionId}'`]
        for (const col of ooColumns('sessionId', { skip })) {
          clauses.push(`${col} = '${sessionId}'`)
        }
        const userPredicate = identityPredicate(opts, skip)
        return `SELECT DISTINCT trace_id FROM "${cfg.stream}" WHERE (${clauses.join(' OR ')}) ${
          userPredicate ? `AND (${userPredicate})` : opts?.userId || opts?.userName ? 'AND 1 = 0' : ''
        }`
      }
      const trHits = await searchDroppingMissing(
        (skip) => search(buildTraceSql(skip), fromUs, toUs),
        allOptionalCols(['sessionId', 'userName', 'userId']),
      )
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
      const buildSql = (skip: ReadonlySet<string>) => {
        const sessionCols = ooColumns('sessionId', { skip })
        const tokenCols = ooColumns('totalTokens', { skip })
        const costCols = ooColumns('costUsd', { skip, extras: LLM_COST_EXTRAS })
        const uidCols = ooColumns('userId', { skip })
        const unameCols = ooColumns('userName', { skip })
        const maxOf = (cols: readonly string[]) =>
          cols.length === 0
            ? 'NULL'
            : cols.length === 1
              ? `MAX(${cols[0]})`
              : `COALESCE(${cols.map((c) => `MAX(${c})`).join(', ')})`
        const sumChatOf = (cols: readonly string[]) =>
          cols.length === 0
            ? '0'
            : `SUM(CASE WHEN gen_ai_operation_name = 'chat' THEN ${
                cols.length === 1 ? cols[0] : `COALESCE(${cols.join(', ')})`
              } ELSE 0 END)`
        return `
        SELECT
          trace_id,
          MIN(start_time) AS first_seen,
          MAX(end_time)   AS last_seen,
          COUNT(*)        AS span_count,
          ${sumChatOf(tokenCols)} AS total_tokens,
          ${sumChatOf(costCols)} AS total_cost,
          MAX(CASE WHEN operation_name LIKE 'invoke_agent %' THEN operation_name END) AS sample_agent,
          MAX(CASE WHEN span_status = 'ERROR' THEN 1 ELSE 0 END) AS has_error,
          ${maxOf(sessionCols)} AS session_id,
          MAX(service_name)    AS service_name,
          MAX(CASE WHEN operation_name LIKE 'execute_tool %' AND reference_parent_span_id IS NULL THEN 1 ELSE 0 END) AS has_root_execute_tool,
          SUM(CASE WHEN operation_name LIKE 'invoke_agent %' THEN 1 ELSE 0 END) AS invoke_agent_count,
          SUM(CASE WHEN gen_ai_operation_name = 'chat' THEN 1 ELSE 0 END) AS chat_count,
          ${sessionKindCol ? `MAX(${sessionKindCol}) AS session_kind,` : ''}
          ${llmPurposeCol ? `MAX(${llmPurposeCol}) AS llm_purpose,` : ''}
          ${skip.has('session_trigger_type') ? '' : `MAX(session_trigger_type) AS trigger_type,`}
          ${skip.has('session_execution') ? '' : `MAX(session_execution) AS execution,`}
          MAX(CASE WHEN reference_parent_span_id IS NULL THEN operation_name END) AS root_operation,
          ${maxOf(uidCols)} AS trace_user_id,
          ${maxOf(unameCols)} AS trace_user_name
        FROM "${cfg.stream}"
        WHERE gen_ai_operation_name IS NOT NULL
           OR operation_name LIKE 'invoke_agent %'
           OR operation_name LIKE 'execute_tool %'
        GROUP BY trace_id
        ORDER BY first_seen DESC
        LIMIT ${limit}
      `
      }
      const hits = await searchDroppingMissing(
        (skip) => search(buildSql(skip), fromUs, toUs, limit),
        [
          ...allOptionalCols(['sessionId', 'totalTokens', 'costUsd', 'userId', 'userName'], {
            costUsd: LLM_COST_EXTRAS,
          }),
          'session_trigger_type',
          'session_execution',
        ],
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

function identityPredicate(
  opts: { userId?: string; userName?: string } | undefined,
  skip: ReadonlySet<string>,
): string | undefined {
  const id = pickIdentityValue(opts)
  if (!id) return undefined
  const cols = ooColumns(id.kind === 'id' ? 'userId' : 'userName', { skip })
  return cols.map((k) => `${k} = ${sqlString(id.value)}`).join(' OR ') || undefined
}

// Flatten the per-field optional-column list for searchDroppingMissing.
function allOptionalCols(
  fields: readonly CanonicalField[],
  extrasMap: Partial<Record<CanonicalField, readonly string[]>> = {},
): string[] {
  return fields.flatMap((f) => ooColumns(f, { extras: extrasMap[f] }))
}

function sqlString(value: string): string {
  return `'${value.replaceAll("'", "''")}'`
}

function hitToSummary(h: Record<string, unknown>): TraceSummary {
  const firstSeenNs = Number(h.first_seen ?? 0)
  const lastSeenNs = Number(h.last_seen ?? 0)
  const hasSession = typeof h.session_id === 'string' && h.session_id.length > 0
  const summary: TraceSummary = {
    id: String(h.trace_id),
    startedAtMs: Math.floor(firstSeenNs / 1_000_000),
    durationMs: Math.max(0, Math.floor((lastSeenNs - firstSeenNs) / 1_000_000)),
    spanCount: Number(h.span_count ?? 0),
    hasError: Number(h.has_error ?? 0) === 1,
    hasSessionAttribute: hasSession,
  }
  const tokens = num(h.total_tokens)
  if (tokens) summary.totalTokens = tokens
  const cost = num(h.total_cost)
  if (cost) summary.totalCostUsd = cost
  const agent = extractAgentName(String(h.sample_agent ?? ''))
  if (agent) summary.agent = agent
  if (hasSession) summary.sessionId = String(h.session_id)
  const service = h.service_name
  if (typeof service === 'string' && service) summary.serviceName = service
  const rootOp = h.root_operation
  if (typeof rootOp === 'string' && rootOp) summary.rootOperation = rootOp
  const userId = h.trace_user_id
  if (typeof userId === 'string' && userId) summary.userId = userId
  const userName = h.trace_user_name
  if (typeof userName === 'string' && userName) summary.userName = userName

  const triggerType = pickStringField(h.trigger_type)
  if (triggerType) summary.triggerType = triggerType
  const execution = pickStringField(h.execution)
  if (execution) summary.execution = execution
  const llmPurpose = pickStringField(h.llm_purpose)
  if (llmPurpose) summary.llmPurpose = llmPurpose
  summary.category = classifyTraceCategory({
    hasSessionAttribute: hasSession,
    hasRootExecuteTool: Number(h.has_root_execute_tool) > 0,
    invokeAgentCount: Number(h.invoke_agent_count ?? 0),
    chatCount: Number(h.chat_count ?? 0),
    triggerType,
    execution,
    llmPurpose,
  })
  return summary
}

function pickStringField(v: unknown): string | undefined {
  return typeof v === 'string' && v ? v : undefined
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
  // OpenObserve stores start_time/end_time in nanoseconds. Normalize to ms.
  const startMs = Math.floor(Number(h.start_time ?? 0) / 1_000_000)
  const endMs = Math.floor(Number(h.end_time ?? 0) / 1_000_000)
  return {
    id: String(h.span_id),
    traceId: String(h.trace_id ?? ''),
    parentId: (h.reference_parent_span_id as string) || null,
    service: String(h.service_name ?? 'unknown'),
    kind: kindFromNumber(h.span_kind),
    name: operationName,
    startMs,
    endMs,
    ...(h.span_status === 'ERROR' ? { hasError: true } : {}),
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
