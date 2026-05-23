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
import { ooCoalesceAs, ooColumns } from './conventions'
import { readFieldConfig } from './field-config'
import { aggregateSessions, classifySpanRow, groupBy, num, pickIdentityValue, pickStringValue } from './shared'
import { classifyTraceCategory } from './trace-category'
import type {
  GetTraceOpts,
  ListSpansOpts,
  ListTracesOpts,
  OpenObserveProvider,
  SessionFetch,
  SpanSummary,
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

// OO-specific column quirks: alternate `_o2_*` forms exist when an attribute
// collided with a reserved name at ingest. Not OTel attributes — kept here
// rather than polluting the convention table.
const LLM_INPUT_EXTRAS = ['_o2_llm_input']
const LLM_COST_EXTRAS = ['_o2_llm_cost_details_total']

const SCHEMA_TTL_MS = 5 * 60 * 1000

export function createOpenObserveProvider(cfg: OpenObserveConfig): OpenObserveProvider {
  // sessionKind/llmPurpose are deployment-specific, not OTel — stay in field-config.
  const { sessionKindField, llmPurposeField } = readFieldConfig()
  const sessionKindCol = sessionKindField?.replace(/\./g, '_')
  const llmPurposeCol = llmPurposeField?.replace(/\./g, '_')
  const auth = btoa(`${cfg.user}:${cfg.password}`)

  let schemaCache: { cols: Set<string>; at: number } | undefined
  const getKnownColumns = async (): Promise<Set<string>> => {
    if (schemaCache && Date.now() - schemaCache.at < SCHEMA_TTL_MS) return schemaCache.cols
    const resp = await fetch(`${cfg.baseUrl}/api/${cfg.org}/streams/${cfg.stream}/schema?type=traces`, {
      headers: { Authorization: `Basic ${auth}` },
    })
    // Stream not ingested yet, or upstream error — cache empty so optional
    // columns fall back to '' literals; queries that need real data still run.
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
    size = DEFAULT_SIZE,
  ): Promise<Array<Record<string, unknown>>> => {
    const body = JSON.stringify({
      query: { sql, start_time: fromUs, end_time: toUs, from: 0, size },
    })
    const resp = await fetch(`${cfg.baseUrl}/api/${cfg.org}/_search?type=traces`, {
      method: 'POST',
      headers: { Authorization: `Basic ${auth}`, 'Content-Type': 'application/json' },
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

  // Build the SQL with a fresh column set; on 20004 (new column appeared after
  // cache, or schema raced), drop the cache and retry exactly once.
  const runWithSchema = async <T>(run: (known: ReadonlySet<string>) => Promise<T>): Promise<T> => {
    try {
      return await run(await getKnownColumns())
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
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
      return {
        spans,
        truncated: hits.length >= DEFAULT_SIZE,
        focusSpanId: traceId !== realTraceId ? traceId : undefined,
      }
    },

    async listSessions(opts) {
      const { fromUs, toUs } = window(opts)
      const limit = opts?.limit ?? DEFAULT_LIST_LIMIT
      // Pull every row needed to (a) resolve a trace's session id and (b)
      // roll up its tokens/cost. Group by trace in TS, then by session.
      const buildSql = (known: ReadonlySet<string>) => {
        const userPredicate = identityPredicate(opts, known)
        const sessionCols = ooColumns('sessionId', { known })
        return `
        SELECT
          trace_id,
          span_id,
          reference_parent_span_id,
          operation_name,
          ${ooCoalesceAs('sessionId', 'ag_ui_thread_id', { known })},
          ${ooCoalesceAs('sessionTitle', 'ag_ui_thread_title', { known })},
          ${ooCoalesceAs('llmInput', 'llm_input', { known, extras: LLM_INPUT_EXTRAS })},
          ${ooCoalesceAs('userName', 'user_name', { known })},
          ${ooCoalesceAs('userId', 'user_id', { known })},
          ${ooCoalesceAs('host', 'host_name', { known })},
          start_time,
          end_time,
          gen_ai_operation_name,
          ${ooCoalesceAs('totalTokens', 'llm_usage_tokens_total', { known })},
          ${ooCoalesceAs('costUsd', 'llm_usage_cost_total', { known, extras: LLM_COST_EXTRAS })},
          ${ooCoalesceAs('inputTokens', 'gen_ai_usage_input_tokens', { known })},
          ${ooCoalesceAs('outputTokens', 'gen_ai_usage_output_tokens', { known })},
          ${known.has('session_trigger_type') ? `session_trigger_type AS trigger_type,` : ''}
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
        const userPredicate = identityPredicate(opts, known)
        return `SELECT DISTINCT trace_id FROM "${cfg.stream}" WHERE (${clauses.join(' OR ')}) ${
          userPredicate ? `AND (${userPredicate})` : opts?.userId || opts?.userName ? 'AND 1 = 0' : ''
        }`
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
        const tokenCols = ooColumns('totalTokens', { known })
        const costCols = ooColumns('costUsd', { known, extras: LLM_COST_EXTRAS })
        const uidCols = ooColumns('userId', { known })
        const unameCols = ooColumns('userName', { known })
        const has = (c: string) => known.has(c)
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
          MAX(CASE WHEN span_status = 'ERROR' AND (gen_ai_operation_name IS NOT NULL OR operation_name LIKE 'invoke_agent %' OR operation_name LIKE 'execute_tool %') THEN 1 ELSE 0 END) AS has_error,
          ${maxOf(sessionCols)} AS session_id,
          MAX(service_name)    AS service_name,
          MAX(CASE WHEN operation_name LIKE 'execute_tool %' AND reference_parent_span_id IS NULL THEN 1 ELSE 0 END) AS has_root_execute_tool,
          MAX(CASE WHEN operation_name LIKE 'invoke_agent %' THEN 1 ELSE 0 END) AS has_invoke_agent,
          MAX(CASE WHEN gen_ai_operation_name = 'chat' THEN 1 ELSE 0 END) AS has_chat,
          ${sessionKindCol ? `MAX(${sessionKindCol}) AS session_kind,` : ''}
          ${llmPurposeCol ? `MAX(CASE WHEN reference_parent_span_id IS NULL THEN ${llmPurposeCol} END) AS root_llm_purpose,` : ''}
          ${
            has('session_trigger_type')
              ? `COALESCE(
            MAX(CASE WHEN reference_parent_span_id IS NULL THEN session_trigger_type END),
            MAX(CASE WHEN operation_name LIKE 'invoke_agent %' AND session_trigger_type IS NOT NULL THEN session_trigger_type END)
          ) AS root_trigger_type,`
              : ''
          }
          ${
            has('session_execution')
              ? `COALESCE(
            MAX(CASE WHEN reference_parent_span_id IS NULL THEN session_execution END),
            MAX(CASE WHEN operation_name LIKE 'invoke_agent %' AND session_execution IS NOT NULL THEN session_execution END)
          ) AS root_execution,`
              : ''
          }
          MAX(CASE WHEN reference_parent_span_id IS NULL THEN operation_name END) AS root_operation,
          ${maxOf(uidCols)} AS trace_user_id,
          ${maxOf(unameCols)} AS trace_user_name
        FROM "${cfg.stream}"
        WHERE (gen_ai_operation_name IS NOT NULL
           OR operation_name LIKE 'invoke_agent %'
           OR operation_name LIKE 'execute_tool %'
           OR session_trigger_type IS NOT NULL
           ${(() => {
             const purposeCol = llmPurposeCol ?? 'gen_ai_operation_purpose'
             return has(purposeCol) ? `OR ${purposeCol} IS NOT NULL` : ''
           })()})
          AND operation_name NOT LIKE 'tools/%'
        GROUP BY trace_id
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
      const purposeCol = llmPurposeCol ?? 'gen_ai_operation_purpose'
      const buildSql = (known: ReadonlySet<string>) => {
        const hasPurposeCol = known.has(purposeCol)
        const userPredicate = identityPredicate(opts, known)
        const utilityClause = hasPurposeCol
          ? `(${purposeCol} IS NOT NULL AND reference_parent_span_id IS NOT NULL)`
          : null
        const subAgentClause = `(
          operation_name LIKE 'invoke_agent %'
          AND reference_parent_span_id IN (
            SELECT span_id FROM "${cfg.stream}" WHERE operation_name LIKE 'execute_tool %'
          )
        )`
        const kindWhere = utilityClause ? `(${utilityClause} OR ${subAgentClause})` : subAgentClause
        return `
        SELECT
          span_id,
          trace_id,
          operation_name AS span_name,
          ${hasPurposeCol ? purposeCol : "''"} AS purpose,
          start_time,
          end_time,
          ${ooCoalesceAs('totalTokens', 'total_tokens', { known })},
          ${ooCoalesceAs('costUsd', 'cost_usd', { known, extras: LLM_COST_EXTRAS })},
          gen_ai_request_model AS model_id,
          service_name,
          span_status,
          ${ooCoalesceAs('userId', 'user_id', { known })},
          ${ooCoalesceAs('userName', 'user_name', { known })}
        FROM "${cfg.stream}"
        WHERE ${kindWhere}
        ${userPredicate ? `AND (${userPredicate})` : opts?.userId || opts?.userName ? 'AND 1 = 0' : ''}
        ORDER BY start_time DESC
        LIMIT ${limit}
      `
      }
      const hits = await runWithSchema((known) => search(buildSql(known), fromUs, toUs, limit))
      return hits.map(hitToSpanSummary)
    },
  }
}

function window(opts: GetTraceOpts | ListTracesOpts | ListSpansOpts | undefined): { fromUs: number; toUs: number } {
  const toUs = opts?.toUs ?? Date.now() * 1000
  const fromUs = opts?.fromUs ?? toUs - DEFAULT_WINDOW_US
  return { fromUs, toUs }
}

function identityPredicate(
  opts: { userId?: string; userName?: string } | undefined,
  known: ReadonlySet<string>,
): string | undefined {
  const id = pickIdentityValue(opts)
  if (!id) return undefined
  const cols = ooColumns(id.kind === 'id' ? 'userId' : 'userName', { known })
  return cols.map((k) => `${k} = ${sqlString(id.value)}`).join(' OR ') || undefined
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
  if (typeof h.service_name === 'string' && h.service_name) summary.serviceName = h.service_name
  if (h.span_status === 'ERROR') summary.hasError = true
  if (typeof h.user_id === 'string' && h.user_id) summary.userId = h.user_id
  if (typeof h.user_name === 'string' && h.user_name) summary.userName = h.user_name
  return summary
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

  const rootTriggerType = pickStringValue(h.root_trigger_type)
  if (rootTriggerType) summary.triggerType = rootTriggerType
  const rootExecution = pickStringValue(h.root_execution)
  if (rootExecution) summary.execution = rootExecution
  const rootLlmPurpose = pickStringValue(h.root_llm_purpose)
  if (rootLlmPurpose) summary.llmPurpose = rootLlmPurpose
  summary.category = classifyTraceCategory({
    hasSessionAttribute: hasSession,
    hasRootExecuteTool: Number(h.has_root_execute_tool) > 0,
    hasInvokeAgent: Number(h.has_invoke_agent ?? 0) > 0,
    hasChat: Number(h.has_chat ?? 0) > 0,
    rootTriggerType,
    rootExecution,
    rootLlmPurpose,
  })
  return summary
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
