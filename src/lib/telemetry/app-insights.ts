import { DefaultAzureCredential } from '@azure/identity'
import { LogsQueryClient, type LogsQueryResult, LogsQueryResultStatus } from '@azure/monitor-query-logs'
import { classifySpan } from '#/lib/classify-span'
import type { JsonValue } from '#/lib/json'
import { estimateCostUsd } from '#/lib/llm-pricing'
import {
  dedupeById,
  normalizeTraceRoots,
  propagateInheritedAttrs,
  propagateSessionInTrace,
  type Span,
  type SpanKind,
} from '#/lib/spans'
import { aiCoalesce, attrKeysFor } from './conventions'
import { readFieldConfig } from './field-config'
import { aggregateSessions, groupBy, num, pickIdentityValue, pickStringValue } from './shared'
import { classifyTraceCategory } from './trace-category'
import type {
  AppInsightsProvider,
  GetTraceOpts,
  ListSessionsOpts,
  ListTracesOpts,
  SessionFetch,
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
const SESSION_SCAN_LIMIT = 5000
const DEFAULT_DURATION = 'P30D'

const SESSION_ID_COALESCE = aiCoalesce('sessionId', { includeCustom: true })
const SESSION_TITLE_COALESCE = aiCoalesce('sessionTitle')
const USER_NAME_COALESCE = aiCoalesce('userName')
const USER_ID_COALESCE = aiCoalesce('userId', { includeCustom: true })
// cloud_RoleName is an AppInsights-specific column, not a custom dimension —
// stitched on as a final fallback.
const HOST_COALESCE = `coalesce(${aiCoalesce('host')}, tostring(cloud_RoleName))`

function resultToRows(result: LogsQueryResult): Array<Record<string, unknown>> {
  if (result.status === LogsQueryResultStatus.Success) {
    const table = result.tables[0]
    if (!table) return []
    return table.rows.map((row) => {
      const out: Record<string, unknown> = {}
      table.columnDescriptors.forEach((c, i) => {
        out[c.name] = (row as unknown[])[i]
      })
      return out
    })
  }
  if (result.status === LogsQueryResultStatus.PartialFailure) {
    const table = result.partialTables[0]
    if (!table) return []
    return table.rows.map((row) => {
      const out: Record<string, unknown> = {}
      table.columnDescriptors.forEach((c, i) => {
        out[c.name] = (row as unknown[])[i]
      })
      return out
    })
  }
  return []
}

export function createAppInsightsProvider(cfg: AppInsightsConfig): AppInsightsProvider {
  const { sessionKindField, llmPurposeField } = readFieldConfig()
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
        | top ${SESSION_SCAN_LIMIT} by timestamp asc
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
            | top ${SESSION_SCAN_LIMIT} by timestamp asc
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
      return {
        spans,
        truncated: rows.length >= SESSION_SCAN_LIMIT,
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
      const sessionKindExtend = sessionKindField
        ? `session_kind = tostring(customDimensions["${sessionKindField}"]),`
        : ''
      const llmPurposeExtend = llmPurposeField ? `llm_purpose = tostring(customDimensions["${llmPurposeField}"]),` : ''
      const purposeAttr = llmPurposeField ?? 'gen_ai.operation.purpose'
      const q = `
        ${userCte}
        union dependencies, requests
        | extend gen_op = tostring(customDimensions["gen_ai.operation.name"])
        | where isnotempty(gen_op) or name startswith "invoke_agent " or name startswith "execute_tool " or isnotempty(tostring(customDimensions["${purposeAttr}"])) or isnotempty(tostring(customDimensions["session.trigger_type"]))
        ${userScope}
        | extend
            in_tok = toint(customDimensions["gen_ai.usage.input_tokens"]),
            out_tok = toint(customDimensions["gen_ai.usage.output_tokens"]),
            sess = ${SESSION_ID_COALESCE},
            end_ts = datetime_add('millisecond', toint(duration), timestamp),
            is_root = isempty(operation_ParentId),
            trigger_type = tostring(customDimensions["session.trigger_type"]),
            execution = tostring(customDimensions["session.execution"]),
            ${sessionKindExtend}
            ${llmPurposeExtend}
            u_id = ${USER_ID_COALESCE},
            u_name = ${USER_NAME_COALESCE}
        | summarize
            first_seen = min(timestamp),
            last_seen  = max(end_ts),
            span_count = count(),
            total_tokens = sum(iff(gen_op == "chat", coalesce(in_tok, 0) + coalesce(out_tok, 0), 0)),
            agent_names = make_set_if(name, name startswith "invoke_agent ", 5),
            has_error   = countif(success == false and (isnotempty(gen_op) or name startswith "invoke_agent " or name startswith "execute_tool ")) > 0,
            session_id  = take_any(sess),
            service_name = take_any(cloud_RoleName),
            has_root_execute_tool = countif(is_root and name startswith "execute_tool ") > 0,
            has_invoke_agent = countif(name startswith "invoke_agent ") > 0,
            has_chat = countif(gen_op == "chat") > 0,
            root_trigger_type = take_anyif(trigger_type, is_root),
            root_execution = take_anyif(execution, is_root),
            ${sessionKindField ? 'session_kind = take_any(session_kind),' : ''}
            ${llmPurposeField ? 'root_llm_purpose = take_anyif(llm_purpose, is_root),' : ''}
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
      // Purpose-spans: individual spans with gen_ai.operation.purpose that live
      // inside session-bound traces. Surfaced as standalone "utility" rows so
      // they're visible on /traces even when session traces are hidden.
      const purposeSpansQ = `
        ${userCte}
        union dependencies, requests
        | extend purpose = tostring(customDimensions["${purposeAttr}"])
        | where isnotempty(purpose)
        | where isnotempty(operation_ParentId)
        ${userScope}
        | extend
            in_tok = toint(customDimensions["gen_ai.usage.input_tokens"]),
            out_tok = toint(customDimensions["gen_ai.usage.output_tokens"]),
            end_ts = datetime_add('millisecond', toint(duration), timestamp),
            u_id = ${USER_ID_COALESCE},
            u_name = ${USER_NAME_COALESCE}
        | project
            span_id = id,
            trace_id = operation_Id,
            span_name = name,
            first_seen = timestamp,
            last_seen = end_ts,
            duration_ms = duration,
            total_tokens = coalesce(in_tok, 0) + coalesce(out_tok, 0),
            purpose,
            model_id = tostring(customDimensions["gen_ai.request.model"]),
            service_name = cloud_RoleName,
            has_error = success == false,
            trace_user_id = u_id,
            trace_user_name = u_name
        | top ${limit} by first_seen desc
      `
      // Sub-agent spans: invoke_agent spans whose parent is an execute_tool span.
      // These are sub-agent invocations nested inside session-bound traces.
      const subAgentQ = `
        ${userCte}
        let execute_tool_ids = union dependencies, requests
        | where name startswith "execute_tool "
        ${userScope}
        | project tool_id = id, tool_trace = operation_Id;
        union dependencies, requests
        | where name startswith "invoke_agent "
        | where isnotempty(operation_ParentId)
        ${userScope}
        | join kind=inner execute_tool_ids on $left.operation_ParentId == $right.tool_id, $left.operation_Id == $right.tool_trace
        | extend
            end_ts = datetime_add('millisecond', toint(duration), timestamp),
            u_id = ${USER_ID_COALESCE},
            u_name = ${USER_NAME_COALESCE}
        | project
            span_id = id,
            trace_id = operation_Id,
            span_name = name,
            first_seen = timestamp,
            last_seen = end_ts,
            duration_ms = duration,
            model_id = tostring(customDimensions["gen_ai.request.model"]),
            service_name = cloud_RoleName,
            has_error = success == false,
            trace_user_id = u_id,
            trace_user_name = u_name
        | top ${limit} by first_seen desc
      `
      const [rows, costRows, purposeRows, subAgentRows] = await Promise.all([
        kql(q, timespanFromOpts(opts)),
        kql(costQ, timespanFromOpts(opts)),
        kql(purposeSpansQ, timespanFromOpts(opts)),
        kql(subAgentQ, timespanFromOpts(opts)),
      ])
      const costByTrace = sumCostByTrace(costRows)
      const traceSummaries = rows.map((r) => {
        const summary = rowToTraceSummary(r)
        const cost = costByTrace.get(summary.id)
        if (cost && cost > 0) summary.totalCostUsd = cost
        return summary
      })
      // Convert purpose-spans to TraceSummary rows, deduplicating against
      // traces that are already classified as utility at the trace level.
      const traceIds = new Set(traceSummaries.filter((t) => t.category === 'utility').map((t) => t.id))
      const purposeSummaries: TraceSummary[] = purposeRows
        .filter((r) => !traceIds.has(String(r.trace_id ?? '')))
        .map((r) => ({
          ...spanRowBase(r),
          totalTokens: num(r.total_tokens),
          category: 'utility' as const,
          llmPurpose: typeof r.purpose === 'string' ? r.purpose : undefined,
        }))
      // Convert sub-agent spans to TraceSummary rows.
      const subAgentSummaries: TraceSummary[] = subAgentRows.map((r) => {
        const name = typeof r.span_name === 'string' ? r.span_name : ''
        const agent =
          name
            .replace(/^invoke_agent\s+/, '')
            .replace(/\(.*\)$/, '')
            .trim() || undefined
        return {
          ...spanRowBase(r),
          category: 'sub-agent' as const,
          agent,
        }
      })
      const merged = [...traceSummaries, ...purposeSummaries, ...subAgentSummaries]
      merged.sort((a, b) => b.startedAtMs - a.startedAtMs)
      return merged.slice(0, limit)
    },

    async listSessions(opts) {
      const userFilter = kqlIdentityFilter(opts)
      const purposeAttr = llmPurposeField ?? 'gen_ai.operation.purpose'
      const q = `
        ${userFilter ? `let _user_traces = union dependencies, requests | where ${userFilter} | distinct operation_Id;` : ''}
        union dependencies, requests
        | extend gen_op = tostring(customDimensions["gen_ai.operation.name"])
        | where isnotempty(gen_op) or name startswith "invoke_agent " or name startswith "execute_tool " or isnotempty(tostring(customDimensions["${purposeAttr}"])) or isnotempty(tostring(customDimensions["session.trigger_type"]))
        ${userFilter ? '| where operation_Id in (_user_traces)' : ''}
        | project
            trace_id = operation_Id,
            span_id = id,
            reference_parent_span_id = operation_ParentId,
            operation_name = name,
            start_time_iso = timestamp,
            duration_ms = duration,
            gen_ai_operation_name = gen_op,
            gen_ai_request_model = tostring(customDimensions["gen_ai.request.model"]),
            gen_ai_provider_name = tostring(customDimensions["gen_ai.provider.name"]),
            gen_ai_usage_input_tokens = toint(customDimensions["gen_ai.usage.input_tokens"]),
            gen_ai_usage_output_tokens = toint(customDimensions["gen_ai.usage.output_tokens"]),
            gen_ai_usage_cache_read_input_tokens = toint(customDimensions["gen_ai.usage.cache_read.input_tokens"]),
            llm_usage_tokens_total = toint(customDimensions["gen_ai.usage.input_tokens"])
                                   + toint(customDimensions["gen_ai.usage.output_tokens"]),
            llm_usage_cost_total = coalesce(todouble(customDimensions["llm.usage.cost_total"]),
                                            todouble(customDimensions["gen_ai.usage.cost_total"])),
            llm_input = coalesce(tostring(customDimensions["gen_ai.input.messages"]),
                                 tostring(customDimensions["llm.input"])),
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
      const spans = dedupeById(spanRows.map((r) => normalizeAiRow(r, String(r.operation_Id ?? ''))))

      for (const trSpans of groupBy(spans, (s) => s.traceId).values()) {
        normalizeTraceRoots(trSpans)
        propagateSessionInTrace(trSpans)
        propagateInheritedAttrs(trSpans)
      }

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
  }
}

// Refuse anything that would break out of a quoted KQL literal.
function isSafeId(id: string): boolean {
  return /^[A-Za-z0-9_-]+$/.test(id)
}

// Shared base fields for purpose-span / sub-agent elevated rows.
function spanRowBase(r: Record<string, unknown>): Omit<TraceSummary, 'category'> {
  const name = typeof r.span_name === 'string' ? r.span_name : ''
  return {
    id: String(r.span_id ?? ''),
    startedAtMs: typeof r.first_seen === 'string' ? Date.parse(r.first_seen) : 0,
    durationMs: typeof r.duration_ms === 'number' ? r.duration_ms : Number(r.duration_ms ?? 0),
    spanCount: 1,
    hasError: Boolean(r.has_error),
    hasSessionAttribute: true,
    rootOperation: name || undefined,
    serviceName: typeof r.service_name === 'string' ? r.service_name : undefined,
    userId: typeof r.trace_user_id === 'string' && r.trace_user_id ? r.trace_user_id : undefined,
    userName: typeof r.trace_user_name === 'string' && r.trace_user_name ? r.trace_user_name : undefined,
  }
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
  const failed = row.success === false || row.success === 'False' || row.success === 'false'
  return {
    id: String(row.id ?? ''),
    traceId,
    parentId: (row.operation_ParentId as string) || null,
    service: String(row.cloud_RoleName ?? 'unknown'),
    kind: kindFromAi(row),
    name: operationName,
    startMs,
    endMs,
    ...(failed ? { hasError: true } : {}),
    ...classifySpan(operationName, cd, startMs),
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

function sumCostByTrace(rows: Array<Record<string, unknown>>): Map<string, number> {
  const out = new Map<string, number>()
  for (const r of rows) {
    const id = typeof r.operation_Id === 'string' ? r.operation_Id : null
    if (!id) continue
    const cost = estimateCostUsd({
      model: typeof r.model_id === 'string' ? r.model_id : undefined,
      inputTokens: num(r.in_tok),
      outputTokens: num(r.out_tok),
      cachedInputTokens: num(r.cache_tok),
      provider: typeof r.provider === 'string' ? r.provider : undefined,
      spanStartMs: num(r.ts_ms),
    })
    if (!cost) continue
    out.set(id, (out.get(id) ?? 0) + cost)
  }
  return out
}

function rowToTraceSummary(row: Record<string, unknown>): TraceSummary {
  const firstSeen = typeof row.first_seen === 'string' ? Date.parse(row.first_seen) : 0
  const lastSeen = typeof row.last_seen === 'string' ? Date.parse(row.last_seen) : 0
  const hasSession = typeof row.session_id === 'string' && row.session_id.length > 0
  const summary: TraceSummary = {
    id: String(row.operation_Id ?? ''),
    startedAtMs: firstSeen,
    durationMs: Math.max(0, lastSeen - firstSeen),
    spanCount: Number(row.span_count ?? 0),
    hasError: Boolean(row.has_error),
    hasSessionAttribute: hasSession,
  }
  const tokens = num(row.total_tokens)
  if (tokens) summary.totalTokens = tokens
  const agents = parseDynamic(row.agent_names)
  if (Array.isArray(agents)) {
    const first = agents.find((s): s is string => typeof s === 'string' && s.startsWith('invoke_agent '))
    const m = first?.match(/^invoke_agent\s+([^(\s]+)/)
    if (m) summary.agent = m[1]
  }
  if (hasSession) summary.sessionId = String(row.session_id)
  if (typeof row.service_name === 'string' && row.service_name) summary.serviceName = row.service_name
  const rootOp = row.root_operation
  if (typeof rootOp === 'string' && rootOp) summary.rootOperation = rootOp
  const userId = row.trace_user_id
  if (typeof userId === 'string' && userId) summary.userId = userId
  const userName = row.trace_user_name
  if (typeof userName === 'string' && userName) summary.userName = userName

  const rootTriggerType = pickStringValue(row.root_trigger_type)
  if (rootTriggerType) summary.triggerType = rootTriggerType
  const rootExecution = pickStringValue(row.root_execution)
  if (rootExecution) summary.execution = rootExecution
  const rootLlmPurpose = pickStringValue(row.root_llm_purpose)
  if (rootLlmPurpose) summary.llmPurpose = rootLlmPurpose
  summary.category = classifyTraceCategory({
    hasSessionAttribute: hasSession,
    hasRootExecuteTool: Boolean(row.has_root_execute_tool),
    hasInvokeAgent: Boolean(row.has_invoke_agent),
    hasChat: Boolean(row.has_chat),
    rootTriggerType,
    rootExecution,
    rootLlmPurpose,
  })
  return summary
}

function kqlIdentityFilter(opts: GetTraceOpts | ListSessionsOpts | ListTracesOpts | undefined): string | undefined {
  const id = pickIdentityValue(opts)
  if (!id) return undefined
  const coalesce = id.kind === 'id' ? USER_ID_COALESCE : USER_NAME_COALESCE
  return `${coalesce} == ${kqlString(id.value)}`
}

function kqlString(value: string): string {
  return JSON.stringify(value)
}

function timespanFromOpts(
  opts: GetTraceOpts | ListTracesOpts | ListSessionsOpts | undefined,
): { startTime: Date; endTime: Date } | undefined {
  if (!opts?.fromUs || !opts.toUs) return undefined
  return { startTime: new Date(opts.fromUs / 1000), endTime: new Date(opts.toUs / 1000) }
}
