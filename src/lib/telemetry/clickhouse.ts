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
  SPAN_ID_RE,
  TRACE_FETCH_LIMIT,
} from './shared'
import type {
  ClickHouseProvider,
  GetTraceOpts,
  IdentityFilter,
  ListSort,
  ListSpansOpts,
  ListTracesOpts,
  LogLevel,
  LogRecord,
  SessionFetch,
  SessionSummary,
  SpanSummary,
  TaskRollupRow,
  TraceCategory,
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

// Mirrors classifyTraceCategory (trace-category.ts) over the trace_list view's
// output columns so category is filterable/groupable server-side. Keep the two
// in exact sync.
export const CH_TRACE_CATEGORY = `multiIf(
  root_trigger_type = 'scheduled', 'scheduled',
  root_trigger_type = 'event', 'event',
  root_trigger_type = 'webhook', 'webhook',
  root_trigger_type = 'user' AND root_execution = 'background', 'background',
  root_operation LIKE 'execute_tool %' AND has_invoke_agent != 0, 'sub-agent',
  has_invoke_agent != 0, 'chat',
  root_llm_purpose != '', 'utility',
  session_id != '', 'chat',
  'orphan')`

// Primary agent name for a trace_list row: the invoke_agent attr, else parsed
// from the root invoke_agent span name (mirrors extractAgentName + listTraces).
const CH_TRACE_AGENT =
  "if(sample_agent_name != '', sample_agent_name, extract(sample_agent, '^invoke_agent\\\\s+([^(\\\\s]+)'))"

// The derived task key, composed identically wherever it's built or matched.
// service.name and the agent name can both contain '|', so the key is only ever
// compared whole — never split back into segments. Inverse: taskKeyWhere.
const CH_DERIVED_KEY = `concat('derived:', service_name, '|', (${CH_TRACE_AGENT}), '|', (${CH_TRACE_CATEGORY}))`

// ListSort → ORDER BY expression (always DESC — lists lead with newest/largest).
const TRACE_ORDER: Record<ListSort, string> = {
  recent: 'first_ms',
  cost: 'total_cost',
  tokens: 'total_tokens',
  duration: '(last_ms - first_ms)',
}
const SPAN_ORDER: Record<ListSort, string> = {
  recent: 'Timestamp',
  cost: 'CostUsd',
  tokens: 'if(TotalTokens > 0, TotalTokens, InputTokens + OutputTokens)',
  duration: 'Duration',
}

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
      const offset = Math.max(0, opts?.offset ?? 0)
      // Session aggregation + all drop rules live in the session_list view
      // (init/01-traces.sql); here we page over it. Fetch limit+1 to derive
      // hasMore without a count() query.
      const filters: string[] = []
      const params: Record<string, unknown> = { from_us: fromUs, to_us: toUs, svc: '' }
      if (opts?.userId) {
        filters.push('user_id = {uid:String}')
        params.uid = opts.userId
      }
      if (opts?.userName) {
        filters.push('user_name = {uname:String}')
        params.uname = opts.userName
      }
      if (opts?.host) {
        filters.push('host = {host:String}')
        params.host = opts.host
      }
      if (opts?.status === 'error') filters.push('has_error = 1')
      if (opts?.status === 'ok') filters.push('has_error = 0')
      if (opts?.search) {
        filters.push(
          '(session_id ILIKE {search:String} OR title ILIKE {search:String} OR first_input ILIKE {search:String} OR user_name ILIKE {search:String} OR arrayExists(a -> a ILIKE {search:String}, agents))',
        )
        params.search = `%${opts.search}%`
      }
      const sql = `
        SELECT * FROM session_list(p_from={from_us:Int64}, p_to={to_us:Int64}, p_svc={svc:String})
        ${filters.length ? `WHERE ${filters.join(' AND ')}` : ''}
        ORDER BY last_ms DESC
        LIMIT ${limit + 1} OFFSET ${offset}
      `
      const hits = await run(sql, params)
      const hasMore = hits.length > limit
      return { sessions: hits.slice(0, limit).map(rowToSessionSummary), hasMore }
    },

    // Distinct hosts in the window, straight off session_list — a facet source
    // independent of which session page is loaded.
    async listHosts(opts) {
      const { fromUs, toUs } = window(opts)
      const rows = await run(
        `SELECT host FROM session_list(p_from={from_us:Int64}, p_to={to_us:Int64}, p_svc={svc:String})
         WHERE host != '' GROUP BY host ORDER BY host`,
        { from_us: fromUs, to_us: toUs, svc: '' },
      )
      return rows.map((r) => String(r.host ?? '')).filter(Boolean)
    },

    // Task rollup grouped in SQL — mirrors features/tasks taskIdentity +
    // rollupTasks over fire traces. Representative fields use argMax(x, first_ms)
    // (the latest fire), matching rollupTasks' group[0].
    async listTaskRollup(opts) {
      const { fromUs, toUs } = window(opts)
      const params: Record<string, unknown> = { from_us: fromUs, to_us: toUs, svc: '' }
      const idClauses: string[] = []
      if (opts?.userId) {
        idClauses.push('trace_user_id = {uid:String}')
        params.uid = opts.userId
      }
      if (opts?.userName) {
        idClauses.push('trace_user_name = {uname:String}')
        params.uname = opts.userName
      }
      if (opts?.taskKey) {
        const tk = taskKeyWhere(opts.taskKey)
        idClauses.push(tk.clause)
        Object.assign(params, tk.params)
      }
      const sql = `
        SELECT
          key,
          argMax(task_id, first_ms) AS task_id,
          argMax(task_name, first_ms) AS task_name,
          argMax(task_kind, first_ms) AS task_kind,
          argMax(task_schedule, first_ms) AS task_schedule,
          argMax(task_source, first_ms) AS task_source,
          argMax(root_operation, first_ms) AS root_operation,
          argMax(category, first_ms) AS category,
          argMax(agent, first_ms) AS agent,
          argMax(service_name, first_ms) AS service_name,
          argMax(trace_id, first_ms) AS sample_trace_id,
          count() AS fires,
          sum(has_error) AS errored,
          round(avg(last_ms - first_ms)) AS avg_duration_ms,
          max(first_ms) AS last_fire_ms,
          sum(total_cost) AS cost,
          max(total_cost > 0) AS has_cost,
          groupArray(first_ms) AS fire_ts,
          countIf(session_id = '' OR session_id = trace_id) AS bad_session,
          uniqExact(session_id) AS distinct_sessions,
          anyLast(session_id) AS any_session
        FROM (
          SELECT
            trace_id, first_ms, last_ms, has_error, total_cost, service_name, session_id,
            root_task_id AS task_id, root_task_name AS task_name, root_task_kind AS task_kind,
            root_task_schedule AS task_schedule, root_task_source AS task_source, root_operation,
            (${CH_TRACE_CATEGORY}) AS category,
            (${CH_TRACE_AGENT}) AS agent,
            multiIf(
              root_task_id != '', concat('task:', root_task_id),
              (root_operation != '' AND root_operation NOT LIKE 'invoke_agent%'
                AND root_operation NOT LIKE 'execute_tool%' AND root_operation NOT LIKE 'chat%'),
                concat('op:', root_operation),
              ${CH_DERIVED_KEY}
            ) AS key
          FROM trace_list(p_from={from_us:Int64}, p_to={to_us:Int64}, p_svc={svc:String})
          WHERE root_trigger_type IN ('scheduled', 'event', 'webhook')
            ${idClauses.length ? `AND ${idClauses.join(' AND ')}` : ''}
        )
        GROUP BY key
        ORDER BY fires DESC
        LIMIT 1000
      `
      const hits = await run(sql, params)
      return hits.map(rowToTaskRollupRow)
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
      const offset = Math.max(0, opts?.offset ?? 0)
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
      if (opts?.status === 'error') filters.push('has_error = 1')
      if (opts?.status === 'ok') filters.push('has_error = 0')
      if (opts?.category) {
        filters.push(`(${CH_TRACE_CATEGORY}) = {category:String}`)
        params.category = opts.category
      }
      if (opts?.search) {
        filters.push(
          '(root_operation ILIKE {search:String} OR sample_agent_name ILIKE {search:String} OR service_name ILIKE {search:String} OR session_id ILIKE {search:String} OR root_llm_purpose ILIKE {search:String})',
        )
        params.search = `%${opts.search}%`
      }
      if (opts?.agentContains) {
        filters.push(`(${CH_TRACE_AGENT}) ILIKE {agent_c:String}`)
        params.agent_c = `%${opts.agentContains}%`
      }
      if (opts?.userContains) {
        filters.push('(trace_user_name ILIKE {user_c:String} OR trace_user_id ILIKE {user_c:String})')
        params.user_c = `%${opts.userContains}%`
      }
      if (opts?.sessionContains) {
        filters.push('session_id ILIKE {session_c:String}')
        params.session_c = `%${opts.sessionContains}%`
      }
      if (opts?.minCostUsd !== undefined) {
        filters.push('total_cost >= {min_cost:Float64}')
        params.min_cost = opts.minCostUsd
      }
      if (opts?.minTokens !== undefined) {
        filters.push('total_tokens >= {min_tokens:Int64}')
        params.min_tokens = opts.minTokens
      }
      if (opts?.minDurationMs !== undefined) {
        filters.push('(last_ms - first_ms) >= {min_dur:Int64}')
        params.min_dur = opts.minDurationMs
      }
      if (opts?.taskKey) {
        const tk = taskKeyWhere(opts.taskKey)
        filters.push(tk.clause)
        Object.assign(params, tk.params)
      }
      const sql = `
        SELECT * FROM trace_list(p_from={from_us:Int64}, p_to={to_us:Int64}, p_svc={svc:String})
        ${filters.length ? `WHERE ${filters.join(' AND ')}` : ''}
        ORDER BY ${TRACE_ORDER[opts?.sortBy ?? 'recent']} DESC
        LIMIT ${limit + 1} OFFSET ${offset}
      `
      const hits = await run(sql, params)
      const hasMore = hits.length > limit
      const traces = hits.slice(0, limit).map((h) => {
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
      return { traces, hasMore }
    },

    async listSpans(opts) {
      const { fromUs, toUs } = window(opts)
      const limit = opts?.limit ?? DEFAULT_LIST_LIMIT
      const offset = Math.max(0, opts?.offset ?? 0)
      const identity = whereIdentity(opts)
      const extra: string[] = []
      const extraParams: Record<string, unknown> = {}
      if (opts?.status === 'error') extra.push(`AND ${CH_ERROR_WHERE}`)
      if (opts?.status === 'ok') extra.push(`AND NOT (${CH_ERROR_WHERE})`)
      // kind mirrors classifySpanRow: a purpose attr → utility, else sub-agent.
      if (opts?.kind === 'utility') extra.push("AND Purpose != ''")
      if (opts?.kind === 'sub-agent') extra.push("AND Purpose = ''")
      if (opts?.search) {
        extra.push(
          'AND (SpanName ILIKE {search:String} OR Purpose ILIKE {search:String} OR AgentName ILIKE {search:String} OR Model ILIKE {search:String})',
        )
        extraParams.search = `%${opts.search}%`
      }
      if (opts?.modelContains) {
        extra.push('AND Model ILIKE {model_c:String}')
        extraParams.model_c = `%${opts.modelContains}%`
      }
      if (opts?.agentContains) {
        extra.push(
          'AND (Purpose ILIKE {agent_c:String} OR AgentName ILIKE {agent_c:String} OR SpanName ILIKE {agent_c:String})',
        )
        extraParams.agent_c = `%${opts.agentContains}%`
      }
      if (opts?.userContains) {
        extra.push('AND (UserName ILIKE {user_c:String} OR UserId ILIKE {user_c:String})')
        extraParams.user_c = `%${opts.userContains}%`
      }
      if (opts?.sessionContains) {
        extra.push('AND SessionId ILIKE {session_c:String}')
        extraParams.session_c = `%${opts.sessionContains}%`
      }
      if (opts?.minCostUsd !== undefined) {
        extra.push('AND CostUsd >= {min_cost:Float64}')
        extraParams.min_cost = opts.minCostUsd
      }
      if (opts?.minTokens !== undefined) {
        extra.push('AND if(TotalTokens > 0, TotalTokens, InputTokens + OutputTokens) >= {min_tokens:Int64}')
        extraParams.min_tokens = opts.minTokens
      }
      if (opts?.minDurationMs !== undefined) {
        extra.push(`AND ${DURATION_MS} >= {min_dur:Int64}`)
        extraParams.min_dur = opts.minDurationMs
      }
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
          ${extra.join('\n          ')}
        ORDER BY ${SPAN_ORDER[opts?.sortBy ?? 'recent']} DESC
        LIMIT ${limit + 1} OFFSET ${offset}
      `
      const hits = await run(sql, { from_us: fromUs, to_us: toUs, ...identity.params, ...extraParams })
      const hasMore = hits.length > limit
      return { spans: hits.slice(0, limit).map(hitToSpanSummary), hasMore }
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

// Encoded task identity → a WHERE fragment over trace_list columns. Inverse of
// features/tasks taskIdentity: task:<id> exact root_task_id, op:<root> exact
// root_operation, derived:<svc|agent|cat> matched by rebuilding the whole key
// (CH_DERIVED_KEY) — never by splitting on '|', which svc/agent can contain.
function taskKeyWhere(taskKey: string): { clause: string; params: Record<string, unknown> } {
  if (taskKey.startsWith('task:'))
    return { clause: 'root_task_id = {tk_id:String}', params: { tk_id: taskKey.slice(5) } }
  if (taskKey.startsWith('op:'))
    return { clause: 'root_operation = {tk_op:String}', params: { tk_op: taskKey.slice(3) } }
  if (taskKey.startsWith('derived:'))
    return { clause: `${CH_DERIVED_KEY} = {tk_key:String}`, params: { tk_key: taskKey } }
  return { clause: '1 = 0', params: {} } // unknown form → match nothing, not everything
}

function rowToTaskRollupRow(h: Record<string, unknown>): TaskRollupRow {
  const str = (v: unknown): string | undefined => (typeof v === 'string' && v ? v : undefined)
  const row: TaskRollupRow = {
    key: String(h.key ?? ''),
    category: (str(h.category) ?? 'orphan') as TraceCategory,
    fires: Number(h.fires ?? 0),
    errored: Number(h.errored ?? 0),
    avgDurationMs: Math.round(Number(h.avg_duration_ms ?? 0)),
    lastFireMs: Number(h.last_fire_ms ?? 0),
    sampleTraceId: String(h.sample_trace_id ?? ''),
    fireTimestampsMs: Array.isArray(h.fire_ts) ? (h.fire_ts as unknown[]).map(Number) : [],
  }
  const taskId = str(h.task_id)
  if (taskId) row.taskId = taskId
  const taskName = str(h.task_name)
  if (taskName) row.taskName = taskName
  const taskKind = str(h.task_kind)
  if (taskKind) row.taskKind = taskKind
  const taskSchedule = str(h.task_schedule)
  if (taskSchedule) row.taskSchedule = taskSchedule
  const taskSource = str(h.task_source)
  if (taskSource) row.taskSource = taskSource
  const rootOperation = str(h.root_operation)
  if (rootOperation) row.rootOperation = rootOperation
  const agent = str(h.agent)
  if (agent) row.agent = agent
  const serviceName = str(h.service_name)
  if (serviceName) row.serviceName = serviceName
  if (Number(h.has_cost ?? 0) === 1) {
    const cost = num(h.cost)
    if (cost !== undefined) row.costUsd = cost
  }
  const anySession = str(h.any_session)
  if (Number(h.bad_session ?? 0) === 0 && Number(h.distinct_sessions ?? 0) === 1 && anySession) {
    row.conversationId = anySession
  }
  return row
}

// session_list view row → SessionSummary. The view only emits attribute-keyed
// sessions (trace-fallback + system-only are dropped in SQL), so source is always
// 'attribute'.
function rowToSessionSummary(h: Record<string, unknown>): SessionSummary {
  const s: SessionSummary = {
    sessionId: String(h.session_id ?? ''),
    source: 'attribute',
    startedAtMs: Number(h.first_ms ?? 0),
    lastSeenMs: Number(h.last_ms ?? 0),
    activeDurationMs: Number(h.active_ms ?? 0),
    traceCount: Number(h.trace_count ?? 0),
    agents: Array.isArray(h.agents) ? (h.agents as unknown[]).map(String).filter(Boolean) : [],
  }
  if (typeof h.title === 'string' && h.title) s.title = h.title
  if (typeof h.user_name === 'string' && h.user_name) s.userName = h.user_name
  if (typeof h.user_id === 'string' && h.user_id) s.userId = h.user_id
  if (typeof h.host === 'string' && h.host) s.host = h.host
  if (typeof h.first_input === 'string' && h.first_input) s.firstInput = h.first_input
  const tokens = num(h.total_tokens)
  if (tokens) s.totalTokens = tokens
  const cost = num(h.total_cost)
  if (cost) s.totalCostUsd = cost
  if (Number(h.has_error ?? 0) === 1) s.hasError = true
  return s
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
