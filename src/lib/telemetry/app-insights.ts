import { DefaultAzureCredential } from '@azure/identity'
import { LogsQueryClient, type LogsQueryResult, LogsQueryResultStatus } from '@azure/monitor-query-logs'
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
import { estimateCostUsd } from '#/lib/spans/llm-pricing'
import { aiCoalesce, attrKeysFor } from './conventions'
import {
  aggregateSessions,
  buildLogRecord,
  buildTraceSummary,
  classifyError,
  classifySpanRow,
  groupBy,
  num,
  pickIdentityValue,
  SESSION_SCAN_LIMIT,
  TRACE_FETCH_LIMIT,
} from './shared'
import type {
  AppInsightsProvider,
  GetTraceOpts,
  ListSessionsOpts,
  ListSpansOpts,
  ListTracesOpts,
  LogLevel,
  LogRecord,
  SessionFetch,
  SpanSummary,
  TraceFetch,
  TraceSummary,
} from './types'

// SERVER spans land in `requests`; everything else in `dependencies`. OTel
// attribute keys stay verbatim inside `customDimensions`, so classifySpan
// reads them directly. Roll-up logic is shared with the OpenObserve provider
// — AI rows are reshaped to OO column names before aggregateSessions runs.

export type AppInsightsConfig = { resourceId: string } | { appId: string; apiKey: string; baseUrl?: string }

const DEFAULT_BASE = 'https://api.applicationinsights.io'
const DEFAULT_LIST_LIMIT = 50
const DEFAULT_DURATION = 'P30D'

// Collapses duplicate spans (same operation_Id + id) to their latest copy.
const DEDUPE_SPANS_BY_ID_KQL = '| summarize arg_max(timestamp, *) by operation_Id, id'

// Azure Monitor's .NET exporter writes `operation_ParentId == operation_Id`
// for spans with no real parent instead of leaving it empty. Detect "root" by
// either condition — same handling that Honeycomb / Grafana Tempo's Azure
// Monitor receivers use. Every place that needs "is this a root span" must
// route through this expression; otherwise root-scoped attribute extraction
// (trigger_type, task.*, llm_purpose) silently drops .NET-exported workloads.
const AI_IS_ROOT_EXPR = '(isempty(operation_ParentId) or operation_ParentId == operation_Id)'

const SESSION_ID_COALESCE = aiCoalesce('sessionId')
const SESSION_TITLE_COALESCE = aiCoalesce('sessionTitle')
const USER_NAME_COALESCE = aiCoalesce('userName')
const USER_ID_COALESCE = aiCoalesce('userId')
// cloud_RoleName is an AppInsights-specific column, not a custom dimension —
// stitched on as a final fallback.
const HOST_COALESCE = `coalesce(${aiCoalesce('host')}, tostring(cloud_RoleName))`

function resultToRows(result: LogsQueryResult): Array<Record<string, unknown>> {
  const table =
    result.status === LogsQueryResultStatus.Success
      ? result.tables[0]
      : result.status === LogsQueryResultStatus.PartialFailure
        ? result.partialTables[0]
        : undefined
  if (!table) return []
  return table.rows.map((row) => {
    const out: Record<string, unknown> = {}
    table.columnDescriptors.forEach((c, i) => {
      out[c.name] = (row as unknown[])[i]
    })
    return out
  })
}

export function createAppInsightsProvider(cfg: AppInsightsConfig): AppInsightsProvider {
  type Timespan = { startTime: Date; endTime: Date } | undefined

  let kql: (query: string, timespan?: Timespan) => Promise<Array<Record<string, unknown>>>
  let fingerprint: string

  if ('resourceId' in cfg) {
    // SDK path — uses DefaultAzureCredential, works with Private Link
    const credential = new DefaultAzureCredential()
    const client = new LogsQueryClient(credential)
    fingerprint = cfg.resourceId
    kql = async (query, timespan) => {
      const ts = timespan ?? { duration: DEFAULT_DURATION }
      const result = await client.queryResource(cfg.resourceId, query, ts, {
        serverTimeoutInSeconds: 120,
      })
      return resultToRows(result)
    }
  } else {
    // API key path — direct REST, works on public networks
    const base = cfg.baseUrl ?? DEFAULT_BASE
    const queryUrl = `${base}/v1/apps/${encodeURIComponent(cfg.appId)}/query`
    fingerprint = `${base}/${cfg.appId}`
    kql = async (query, timespan) => {
      const ts = timespan ? `${timespan.startTime.toISOString()}/${timespan.endTime.toISOString()}` : DEFAULT_DURATION
      const resp = await fetch(queryUrl, {
        method: 'POST',
        headers: { 'x-api-key': cfg.apiKey, 'Content-Type': 'application/json' },
        body: JSON.stringify({ query, timespan: ts }),
      })
      if (!resp.ok) throw new Error(`App Insights ${resp.status}: ${await resp.text()}`)
      const data = (await resp.json()) as {
        tables?: Array<{ name: string; columns: { name: string }[]; rows: unknown[][] }>
        error?: { code: string; message: string }
      }
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
  }

  // Exception events land in `exceptions`, not on the span row — join by
  // operation_ParentId == span.id.
  async function attachExceptionsToSpans(spans: Span[], traceIds: string[], timespan: Timespan): Promise<void> {
    const ids = traceIds.filter(isSafeId)
    if (ids.length === 0 || spans.length === 0) return
    const idList = ids.map((id) => `"${id}"`).join(',')
    const q = `
      exceptions
      | where operation_Id in (${idList})
      | summarize arg_min(timestamp, type, outerMessage, outerMethod, details) by operation_ParentId
    `
    const rows = await kql(q, timespan)
    if (rows.length === 0) return
    const bySpan = new Map<string, { type?: string; message?: string; stack?: string }>()
    for (const r of rows) {
      const sid = typeof r.operation_ParentId === 'string' ? r.operation_ParentId : ''
      if (!sid) continue
      bySpan.set(sid, {
        type: typeof r.type === 'string' ? r.type : undefined,
        message: typeof r.outerMessage === 'string' ? r.outerMessage : undefined,
        stack: extractRawStack(r.details) ?? (typeof r.outerMethod === 'string' ? r.outerMethod : undefined),
      })
    }
    for (const s of spans) {
      const exc = bySpan.get(s.id)
      if (!exc) continue
      if (exc.type) s.errorType = exc.type
      if (exc.message) s.errorMessage = exc.message
      if (exc.stack) s.errorStack = exc.stack
    }
  }

  return {
    name: 'app-insights',
    fingerprint,

    query: (q, opts) => kql(q, timespanFromOpts(opts)),

    async getTrace(traceId, opts): Promise<TraceFetch> {
      if (!isSafeId(traceId)) return null
      const q = `
        union dependencies, requests
        | where operation_Id == "${traceId}"
        | project itemType, id, operation_Id, operation_ParentId, name, timestamp, duration,
                  cloud_RoleName, success, type, customDimensions
        | top ${TRACE_FETCH_LIMIT} by timestamp asc
      `
      let rows = await kql(q, timespanFromOpts(opts))
      // If no results, the id might be a span_id (from sub-agent or purpose-span rows).
      // Resolve the actual operation_Id and re-fetch the full trace.
      if (rows.length === 0) {
        const lookup = await kql(
          `union dependencies, requests | where id == "${traceId}" | project operation_Id | take 1`,
          timespanFromOpts(opts),
        )
        const resolvedTraceId = lookup[0]?.operation_Id as string | undefined
        if (resolvedTraceId && isSafeId(resolvedTraceId)) {
          const q2 = `
            union dependencies, requests
            | where operation_Id == "${resolvedTraceId}"
            | project itemType, id, operation_Id, operation_ParentId, name, timestamp, duration,
                      cloud_RoleName, success, type, customDimensions
            | top ${TRACE_FETCH_LIMIT} by timestamp asc
          `
          rows = await kql(q2, timespanFromOpts(opts))
        }
      }
      if (rows.length === 0) return null
      const realTraceId = (rows[0]?.operation_Id as string) ?? traceId
      const spans = dedupeById(rows.map((r) => normalizeAiRow(r, realTraceId)))
      normalizeTraceRoots(spans)
      propagateSessionInTrace(spans)
      propagateInheritedAttrs(spans)
      normalizeRunGraph(spans)
      await attachExceptionsToSpans(spans, [realTraceId], timespanFromOpts(opts))
      return {
        spans,
        truncated: rows.length >= TRACE_FETCH_LIMIT,
        focusSpanId: traceId !== realTraceId ? traceId : undefined,
      }
    },

    async listTraces(opts): Promise<TraceSummary[]> {
      const limit = opts?.limit ?? DEFAULT_LIST_LIMIT
      const userFilter = kqlIdentityFilter(opts)
      const userCte = userFilter
        ? `let _user_traces = union dependencies, requests | where ${userFilter} | distinct operation_Id;`
        : ''
      const userScope = userFilter ? '| where operation_Id in (_user_traces)' : ''
      const q = `
        ${userCte}
        union dependencies, requests
        | extend gen_op = tostring(customDimensions["gen_ai.operation.name"])
        | where (isnotempty(gen_op) or name startswith "invoke_agent " or name startswith "execute_tool " or isnotempty(tostring(customDimensions["gen_ai.operation.purpose"])) or isnotempty(tostring(customDimensions["session.trigger_type"])))
        | where name !startswith "tools/"
        ${userScope}
        ${DEDUPE_SPANS_BY_ID_KQL}
        | extend
            in_tok = toint(customDimensions["gen_ai.usage.input_tokens"]),
            out_tok = toint(customDimensions["gen_ai.usage.output_tokens"]),
            sess = ${SESSION_ID_COALESCE},
            end_ts = datetime_add('millisecond', toint(duration), timestamp),
            is_root = ${AI_IS_ROOT_EXPR},
            trigger_type = tostring(customDimensions["session.trigger_type"]),
            execution = tostring(customDimensions["session.execution"]),
            task_id = tostring(customDimensions["task.id"]),
            task_kind = tostring(customDimensions["task.kind"]),
            task_schedule = tostring(customDimensions["task.schedule"]),
            task_name = tostring(customDimensions["task.name"]),
            task_source = tostring(customDimensions["task.source"]),
            llm_purpose = tostring(customDimensions["gen_ai.operation.purpose"]),
            u_id = ${USER_ID_COALESCE},
            u_name = ${USER_NAME_COALESCE}
        | summarize
            first_seen = min(timestamp),
            last_seen  = max(end_ts),
            span_count = count(),
            total_tokens = sum(iff(gen_op == "chat", coalesce(in_tok, 0) + coalesce(out_tok, 0), 0)),
            agent_name = take_anyif(name, name startswith "invoke_agent "),
            has_error   = countif(success == false and (isnotempty(gen_op) or name startswith "invoke_agent " or name startswith "execute_tool ")) > 0,
            session_id  = take_any(sess),
            service_name = take_any(cloud_RoleName),
            has_invoke_agent = countif(name startswith "invoke_agent ") > 0,
            has_chat = countif(gen_op == "chat") > 0,
            root_trigger_type = coalesce(take_anyif(trigger_type, is_root), take_anyif(trigger_type, isnotempty(trigger_type) and name startswith "invoke_agent ")),
            root_execution = coalesce(take_anyif(execution, is_root), take_anyif(execution, isnotempty(execution) and name startswith "invoke_agent ")),
            root_task_id = take_anyif(task_id, is_root and isnotempty(task_id)),
            root_task_kind = take_anyif(task_kind, is_root and isnotempty(task_kind)),
            root_task_schedule = take_anyif(task_schedule, is_root and isnotempty(task_schedule)),
            root_task_name = take_anyif(task_name, is_root and isnotempty(task_name)),
            root_task_source = take_anyif(task_source, is_root and isnotempty(task_source)),
            root_llm_purpose = take_anyif(llm_purpose, is_root),
            root_operation = take_anyif(name, is_root),
            trace_user_id = take_any(u_id),
            trace_user_name = take_any(u_name)
          by operation_Id
        | top ${limit} by first_seen desc
      `
      // Cost is computed per (trace, model) chat span and summed in TS — same
      // pattern Langfuse uses (per-observation cost in their DB, SUM in queries).
      // KQL can't price models, so we keep the math here and just ship the
      // grouped tokens. Two parallel queries: smaller payload than a packed bag.
      const costQ = `
        ${userCte}
        union dependencies, requests
        | where tostring(customDimensions["gen_ai.operation.name"]) == "chat"
        ${userScope}
        ${DEDUPE_SPANS_BY_ID_KQL}
        | extend
            in_tok    = toint(customDimensions["gen_ai.usage.input_tokens"]),
            out_tok   = toint(customDimensions["gen_ai.usage.output_tokens"]),
            cache_tok = toint(customDimensions["gen_ai.usage.cache_read.input_tokens"]),
            model_id  = tostring(customDimensions["gen_ai.request.model"]),
            provider  = tostring(customDimensions["gen_ai.provider.name"]),
            ts_ms     = tolong(datetime_diff('millisecond', timestamp, datetime(1970-01-01)))
        | summarize
            in_tok    = sum(in_tok),
            out_tok   = sum(out_tok),
            cache_tok = sum(cache_tok),
            ts_ms     = min(ts_ms)
          by operation_Id, model_id, provider
      `
      const [rows, costRows] = await Promise.all([kql(q, timespanFromOpts(opts)), kql(costQ, timespanFromOpts(opts))])
      const costByTrace = sumCostByTrace(costRows)
      return rows.map((r) => {
        const summary = rowToTraceSummary(r)
        const cost = costByTrace.get(summary.id)
        if (cost && cost > 0) summary.totalCostUsd = cost
        return summary
      })
    },

    async listSpans(opts): Promise<SpanSummary[]> {
      const limit = opts?.limit ?? DEFAULT_LIST_LIMIT
      const userFilter = kqlIdentityFilter(opts)
      const q = `
        let execute_tool_ids = union dependencies, requests
        | where name startswith "execute_tool "
        ${DEDUPE_SPANS_BY_ID_KQL}
        | project tool_id = id;
        union dependencies, requests
        | extend purpose = tostring(customDimensions["gen_ai.operation.purpose"])
        | extend is_utility = isnotempty(purpose) and not (${AI_IS_ROOT_EXPR}),
                 is_subagent = (name startswith "invoke_agent " and operation_ParentId in (execute_tool_ids))
                               or isnotempty(${aiCoalesce('taskParentId')})
        | where is_utility or is_subagent
        ${userFilter ? `| where ${userFilter}` : ''}
        ${DEDUPE_SPANS_BY_ID_KQL}
        | extend
            in_tok = toint(customDimensions["gen_ai.usage.input_tokens"]),
            out_tok = toint(customDimensions["gen_ai.usage.output_tokens"]),
            cache_tok = toint(customDimensions["gen_ai.usage.cache_read.input_tokens"]),
            model_id = ${aiCoalesce('model')},
            provider = tostring(customDimensions["gen_ai.provider.name"]),
            end_ts = datetime_add('millisecond', toint(duration), timestamp),
            u_id = ${USER_ID_COALESCE},
            u_name = ${USER_NAME_COALESCE}
        | project
            span_id = id,
            trace_id = operation_Id,
            span_name = name,
            purpose,
            first_seen = timestamp,
            last_seen = end_ts,
            duration_ms = duration,
            in_tok, out_tok, cache_tok,
            model_id, provider,
            has_error = success == false,
            trace_user_id = u_id,
            trace_user_name = u_name
        | top ${limit} by first_seen desc
      `
      const rows = await kql(q, timespanFromOpts(opts))
      return rows.map(rowToSpanSummary)
    },

    async listSessions(opts) {
      const userFilter = kqlIdentityFilter(opts)
      const q = `
        ${userFilter ? `let _user_traces = union dependencies, requests | where ${userFilter} | distinct operation_Id;` : ''}
        union dependencies, requests
        | extend gen_op = tostring(customDimensions["gen_ai.operation.name"])
        | extend sess = ${SESSION_ID_COALESCE}
        | where isnotempty(gen_op) or name startswith "invoke_agent " or name startswith "execute_tool " or isnotempty(tostring(customDimensions["gen_ai.operation.purpose"])) or isnotempty(tostring(customDimensions["session.trigger_type"])) or isnotempty(sess)
        ${userFilter ? '| where operation_Id in (_user_traces)' : ''}
        ${DEDUPE_SPANS_BY_ID_KQL}
        | extend start_ms = tolong(datetime_diff('millisecond', timestamp, datetime(1970-01-01)))
        | project
            trace_id = operation_Id,
            span_id = id,
            reference_parent_span_id = operation_ParentId,
            operation_name = name,
            start_ms,
            end_ms = start_ms + tolong(duration),
            gen_ai_operation_name = gen_op,
            gen_ai_request_model = ${aiCoalesce('model')},
            gen_ai_provider_name = tostring(customDimensions["gen_ai.provider.name"]),
            gen_ai_usage_input_tokens = toint(customDimensions["gen_ai.usage.input_tokens"]),
            gen_ai_usage_output_tokens = toint(customDimensions["gen_ai.usage.output_tokens"]),
            gen_ai_usage_cache_read_input_tokens = toint(customDimensions["gen_ai.usage.cache_read.input_tokens"]),
            gen_ai_usage_total_tokens = toint(customDimensions["gen_ai.usage.input_tokens"])
                                      + toint(customDimensions["gen_ai.usage.output_tokens"]),
            gen_ai_usage_cost_total = todouble(customDimensions["gen_ai.usage.cost_total"]),
            gen_ai_input_messages = tostring(customDimensions["gen_ai.input.messages"]),
            span_status = iff(success == false, "ERROR", "OK"),
            trigger_type = tostring(customDimensions["session.trigger_type"]),
            ag_ui_thread_id = ${SESSION_ID_COALESCE},
            ag_ui_thread_title = ${SESSION_TITLE_COALESCE},
            user_name = ${USER_NAME_COALESCE},
            user_id = ${USER_ID_COALESCE},
            host_name = ${HOST_COALESCE}
        | top ${SESSION_SCAN_LIMIT} by start_ms desc
      `
      const rows = await kql(q, timespanFromOpts(opts))
      const limit = opts?.limit ?? DEFAULT_LIST_LIMIT
      const truncated = rows.length >= SESSION_SCAN_LIMIT
      return { sessions: aggregateSessions(rows, limit), truncated }
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
      const spans = dedupeById(spanRows.map((r) => normalizeAiRow(r, String(r.operation_Id ?? ''))))

      for (const trSpans of groupBy(spans, (s) => s.traceId).values()) {
        normalizeTraceRoots(trSpans)
        propagateSessionInTrace(trSpans)
        propagateInheritedAttrs(trSpans)
        normalizeRunGraph(trSpans)
      }
      await attachExceptionsToSpans(spans, traceIds, timespanFromOpts(opts))

      const source: 'attribute' | 'trace' = spans.some((s) => s.sessionSource === 'attribute') ? 'attribute' : 'trace'
      let title: string | undefined
      for (const r of spanRows) {
        const cd = parseCustomDimensions(r.customDimensions)
        for (const k of attrKeysFor('sessionTitle')) {
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

    async listLogs(opts) {
      const ids = opts.traceIds.filter(isSafeId)
      if (ids.length === 0) return []
      const idList = ids.map((id) => `"${id}"`).join(', ')
      const limit = opts.limit ?? 1000
      const q = `
        union
          (traces
            | where operation_Id in (${idList})
            | project timestamp, severityLevel, message, cloud_RoleName, operation_Id, operation_ParentId, customDimensions, itemType="trace"),
          (exceptions
            | where operation_Id in (${idList})
            | extend message = strcat(type, ": ", outerMessage)
            | extend severityLevel = toint(3)
            | project timestamp, severityLevel, message, cloud_RoleName, operation_Id, operation_ParentId, customDimensions, itemType="exception")
        | order by timestamp asc
        | take ${limit}
      `
      const rows = await kql(q, timespanFromOpts(opts))
      return rows.map(aiRowToLogRecord)
    },
  }
}

// Refuse anything that would break out of a quoted KQL literal.
function isSafeId(id: string): boolean {
  return /^[A-Za-z0-9_-]+$/.test(id)
}

function aiRowToLogRecord(r: Record<string, unknown>): LogRecord {
  const tsRaw = r.timestamp
  const tsMs = tsRaw instanceof Date ? tsRaw.getTime() : Number(new Date(String(tsRaw)))
  // KQL `union` of `traces` (severityLevel:int) with `exceptions` (we extend
  // severityLevel as `3` → long) splits the column into severityLevel_int
  // and severityLevel_long. Read whichever the row carries.
  const sev = r.severityLevel ?? r.severityLevel_int ?? r.severityLevel_long
  return buildLogRecord({
    timestampMs: Number.isFinite(tsMs) ? tsMs : 0,
    level: aiSeverityToLevel(sev, r.itemType),
    message: typeof r.message === 'string' ? r.message : '',
    source: typeof r.cloud_RoleName === 'string' && r.cloud_RoleName ? r.cloud_RoleName : undefined,
    traceId: typeof r.operation_Id === 'string' ? r.operation_Id : undefined,
    spanId: typeof r.operation_ParentId === 'string' ? r.operation_ParentId : undefined,
    attributes: { ...r, customDimensions: parseCustomDimensions(r.customDimensions) },
  })
}

// AI severityLevel: 0=Verbose, 1=Information, 2=Warning, 3=Error, 4=Critical.
function aiSeverityToLevel(v: unknown, itemType: unknown): LogLevel {
  if (itemType === 'exception') return 'error'
  const n = Number(v)
  if (n === 0) return 'debug'
  if (n === 2) return 'warn'
  if (n === 3) return 'error'
  if (n === 4) return 'fatal'
  return 'info'
}

function parseDynamic(raw: unknown): unknown {
  if (typeof raw !== 'string') return raw
  try {
    return JSON.parse(raw)
  } catch {
    return undefined
  }
}

// `details` is a JSON array of chained exception frames; the outermost frame's
// `rawStack` is the full multi-line .NET stack.
function extractRawStack(raw: unknown): string | undefined {
  const parsed = parseDynamic(raw)
  if (!Array.isArray(parsed) || parsed.length === 0) return undefined
  const first = parsed[0]
  if (first && typeof first === 'object' && 'rawStack' in first) {
    const stack = (first as Record<string, unknown>).rawStack
    if (typeof stack === 'string' && stack.length > 0) return stack
  }
  return undefined
}

function parseCustomDimensions(raw: unknown): Record<string, unknown> {
  const v = parseDynamic(raw)
  return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {}
}

function timeBounds(timestampIso: unknown, durationMs: unknown): { startMs: number; endMs: number } {
  const startMs = typeof timestampIso === 'string' ? Date.parse(timestampIso) : 0
  const dur = typeof durationMs === 'number' ? durationMs : Number(durationMs ?? 0)
  return { startMs, endMs: startMs + (Number.isFinite(dur) ? dur : 0) }
}

export function normalizeAiRow(row: Record<string, unknown>, traceId: string): Span {
  const cd = parseCustomDimensions(row.customDimensions)
  const operationName = String(row.name ?? '?')
  const { startMs, endMs } = timeBounds(row.timestamp, row.duration)
  const failed = row.success === false || row.success === 'False' || row.success === 'false'
  const rawParent = typeof row.operation_ParentId === 'string' ? row.operation_ParentId : ''
  // Azure Monitor's .NET exporter sets operation_ParentId == operation_Id for
  // root spans; treat that as null so tree-walking sees a clean root.
  const parentId = rawParent && rawParent !== row.operation_Id ? rawParent : null
  // .NET instrumentation puts HTTP status ("401") OR an exception class in
  // `error.type`. classifyError() routes to message vs type so we don't
  // render "401: HTTP 401".
  const { errorType, errorMessage } = classifyError({
    failed,
    errorType: typeof cd['error.type'] === 'string' ? (cd['error.type'] as string) : undefined,
    httpStatus: typeof row.resultCode === 'string' ? row.resultCode : undefined,
  })
  const typeStr = typeof row.type === 'string' ? row.type.toLowerCase() : ''
  const kind: SpanKind = row.itemType === 'request' ? 'server' : typeStr.includes('http') ? 'client' : 'internal'
  // customDimensions wins on key collisions — those are the canonical OTel attrs.
  const rawAttributes: Record<string, JsonValue> = {}
  for (const [k, v] of Object.entries(row)) {
    if (k === 'customDimensions') continue
    rawAttributes[k] = v as JsonValue
  }
  for (const [k, v] of Object.entries(cd)) rawAttributes[k] = v as JsonValue
  return {
    id: String(row.id ?? ''),
    traceId,
    parentId,
    service: String(row.cloud_RoleName ?? 'unknown'),
    kind,
    name: operationName,
    startMs,
    endMs,
    ...(failed ? { hasError: true } : {}),
    ...(errorType ? { errorType } : {}),
    ...(errorMessage ? { errorMessage } : {}),
    ...classifySpan(operationName, cd, startMs),
    rawAttributes,
  }
}

function costFromRow(row: Record<string, unknown>, spanStartMs: number | undefined): number | undefined {
  return estimateCostUsd({
    model: typeof row.model_id === 'string' ? row.model_id : undefined,
    inputTokens: num(row.in_tok),
    outputTokens: num(row.out_tok),
    cachedInputTokens: num(row.cache_tok),
    provider: typeof row.provider === 'string' ? row.provider : undefined,
    spanStartMs,
  })
}

function sumCostByTrace(rows: Array<Record<string, unknown>>): Map<string, number> {
  const out = new Map<string, number>()
  for (const r of rows) {
    const id = typeof r.operation_Id === 'string' ? r.operation_Id : null
    if (!id) continue
    const cost = costFromRow(r, num(r.ts_ms))
    if (!cost) continue
    out.set(id, (out.get(id) ?? 0) + cost)
  }
  return out
}

function rowToSpanSummary(row: Record<string, unknown>): SpanSummary {
  const firstSeen = typeof row.first_seen === 'string' ? Date.parse(row.first_seen) : 0
  const spanName = String(row.span_name ?? '')
  const purpose = typeof row.purpose === 'string' ? row.purpose : ''
  const { kind, label } = classifySpanRow(spanName, purpose)
  const summary: SpanSummary = {
    spanId: String(row.span_id ?? ''),
    traceId: String(row.trace_id ?? ''),
    spanName,
    kind,
    label,
    startedAtMs: firstSeen,
    durationMs: typeof row.duration_ms === 'number' ? row.duration_ms : Number(row.duration_ms ?? 0),
  }
  const tokens = (num(row.in_tok) ?? 0) + (num(row.out_tok) ?? 0)
  if (tokens > 0) summary.totalTokens = tokens
  const cost = costFromRow(row, firstSeen)
  if (cost) summary.totalCostUsd = cost
  if (typeof row.model_id === 'string' && row.model_id) summary.modelId = row.model_id
  if (row.has_error === true || row.has_error === 'True' || row.has_error === 'true') summary.hasError = true
  if (typeof row.trace_user_id === 'string' && row.trace_user_id) summary.userId = row.trace_user_id
  if (typeof row.trace_user_name === 'string' && row.trace_user_name) summary.userName = row.trace_user_name
  return summary
}

function rowToTraceSummary(row: Record<string, unknown>): TraceSummary {
  const firstSeen = typeof row.first_seen === 'string' ? Date.parse(row.first_seen) : 0
  const lastSeen = typeof row.last_seen === 'string' ? Date.parse(row.last_seen) : 0
  return buildTraceSummary(row, {
    id: String(row.operation_Id ?? ''),
    startedAtMs: firstSeen,
    durationMs: Math.max(0, lastSeen - firstSeen),
    hasError: Boolean(row.has_error),
    agent: extractAgentName(typeof row.agent_name === 'string' ? row.agent_name : '') || undefined,
  })
}

function kqlIdentityFilter(
  opts: GetTraceOpts | ListSessionsOpts | ListSpansOpts | ListTracesOpts | undefined,
): string | undefined {
  const id = pickIdentityValue(opts)
  if (!id) return undefined
  const coalesce = id.kind === 'id' ? USER_ID_COALESCE : USER_NAME_COALESCE
  return `${coalesce} == ${kqlString(id.value)}`
}

function kqlString(value: string): string {
  return JSON.stringify(value)
}

function timespanFromOpts(
  opts: GetTraceOpts | ListTracesOpts | ListSpansOpts | ListSessionsOpts | undefined,
): { startTime: Date; endTime: Date } | undefined {
  if (!opts?.fromUs || !opts.toUs) return undefined
  return { startTime: new Date(opts.fromUs / 1000), endTime: new Date(opts.toUs / 1000) }
}
