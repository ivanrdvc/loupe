import { tokensFromChars } from '#/lib/format'
import { extractAgentName, extractToolName, parseSystemInstructions } from '#/lib/spans/classify-span'
import { countTokens } from '#/lib/tokens'
import { ooCol, ooColumns } from './conventions'
import { mapToolErrorRow, num, sqlString, toCount } from './shared'
import { bucketSecondsFor, zeroFillBucketedAt } from './time-series'
import type {
  AgentMetrics,
  CacheHitPoint,
  InventoryDiscoveryKind,
  InventoryObservation,
  LatencyPoint,
  OpenObserveProvider,
  RawPayloadBody,
  RunsPoint,
  ToolCallSample,
  ToolErrorRow,
  ToolListOpts,
  ToolPayloadPoint,
  ToolRow,
  TopOpts,
  WindowOpts,
} from './types'

const SPAN_ID_RE = /^[A-Za-z0-9_-]+$/

const TOOL_NAME_RE = /^[A-Za-z0-9_./:-]+$/

// 20004 = column not in stream yet (fresh ingest). Treat as empty.
async function emptyIfColumnMissing<T>(run: () => Promise<T[]>): Promise<T[]> {
  try {
    return await run()
  } catch (e) {
    if (e instanceof Error && e.message.includes('"code":20004')) return []
    throw e
  }
}

export async function fetchToolErrorRates(p: OpenObserveProvider, opts?: TopOpts): Promise<ToolErrorRow[]> {
  const limit = opts?.limit ?? 5
  const sql = `
    SELECT
      operation_name AS name,
      SUM(CASE WHEN span_status = 'ERROR' THEN 1 ELSE 0 END) AS errors,
      COUNT(*) AS total,
      MAX(CASE WHEN span_status = 'ERROR' THEN trace_id END) AS last_error_trace_id
    FROM "${p.stream}"
    WHERE operation_name LIKE 'execute_tool %'
    GROUP BY operation_name
    HAVING errors > 0
    ORDER BY (CAST(errors AS DOUBLE) / total) DESC
    LIMIT ${limit}
  `
  const hits = await emptyIfColumnMissing(() => p.query(sql, { ...opts, size: limit }))
  return hits.map(mapToolErrorRow)
}

// The one execute_tool aggregate: `name` → single-row exact fetch, else the catalog.
export async function fetchTools(p: OpenObserveProvider, opts?: ToolListOpts): Promise<ToolRow[]> {
  const name = opts?.name
  if (name !== undefined && !TOOL_NAME_RE.test(name)) return []
  const limit = name !== undefined ? 1 : (opts?.limit ?? 1000)
  const known = await p.getKnownColumns()
  const sessionCols = ooColumns('sessionId', { known })
  const sessionExpr = sessionCols.length === 0 ? 'NULL' : `MAX(COALESCE(${sessionCols.join(', ')}))`
  const nameWhere =
    name !== undefined
      ? `operation_name = ${sqlString(`execute_tool ${name}`)}`
      : `operation_name LIKE 'execute_tool %'`
  const dimWhere = (opts?.dimensions ?? [])
    .map((d) => ({ col: ooCol(d.field, known), value: d.value }))
    .filter((d) => d.col !== 'NULL') // absent column → can't filter on it; ignore rather than empty the catalog
    .map((d) => ` AND ${d.col} = ${sqlString(d.value)}`)
    .join('')
  const len = 'NULLIF(LENGTH(gen_ai_tool_call_result), 0)'
  const sql = `
    SELECT
      operation_name AS name,
      COUNT(*) AS calls,
      SUM(CASE WHEN LENGTH(gen_ai_tool_call_result) > 0 THEN 1 ELSE 0 END) AS calls_with_result,
      SUM(CASE WHEN span_status = 'ERROR' THEN 1 ELSE 0 END) AS errors,
      AVG(${len}) AS avg_chars,
      approx_percentile_cont(${len}, 0.5) AS p50_chars,
      approx_percentile_cont(${len}, 0.95) AS p95_chars,
      MAX(LENGTH(gen_ai_tool_call_result)) AS max_chars,
      SUM(COALESCE(LENGTH(gen_ai_tool_call_result), 0)) AS total_chars,
      approx_percentile_cont(duration, 0.5) / 1000 AS p50_ms,
      approx_percentile_cont(duration, 0.95) / 1000 AS p95_ms,
      MIN(start_time) AS first_seen_ns,
      MAX(start_time) AS last_seen_ns,
      MAX(trace_id) AS sample_trace_id,
      ${sessionExpr} AS sample_session_id
    FROM "${p.stream}"
    WHERE ${nameWhere}${dimWhere}
    GROUP BY operation_name
    ORDER BY calls DESC
    LIMIT ${limit}
  `
  const hits = await emptyIfColumnMissing(() => p.query(sql, { ...opts, size: limit }))
  const maxTokensByOp = known.has('gen_ai_tool_call_result')
    ? await maxResultTokensByOp(p, `${nameWhere}${dimWhere}`, limit, opts)
    : new Map<string, number>()
  return hits.map((h) => {
    const calls = Number(h.calls ?? 0)
    const errors = Number(h.errors ?? 0)
    const raw = String(h.name ?? '')
    const firstNs = Number(h.first_seen_ns ?? 0)
    const lastNs = Number(h.last_seen_ns ?? 0)
    const sample = h.sample_trace_id
    const session = h.sample_session_id
    return {
      name: extractToolName(raw) ?? raw,
      calls,
      callsWithResult: Number(h.calls_with_result ?? 0),
      errors,
      errorRate: calls > 0 ? errors / calls : 0,
      avgTokensEst: tokensFromChars(toCount(h.avg_chars)),
      p50TokensEst: tokensFromChars(toCount(h.p50_chars)),
      p95TokensEst: tokensFromChars(toCount(h.p95_chars)),
      maxTokens: maxTokensByOp.get(raw) ?? tokensFromChars(toCount(h.max_chars)),
      totalTokensEst: tokensFromChars(toCount(h.total_chars)),
      p50Ms: Math.round(num(h.p50_ms) ?? 0),
      p95Ms: Math.round(num(h.p95_ms) ?? 0),
      firstSeenMs: firstNs > 0 ? Math.floor(firstNs / 1_000_000) : 0,
      lastSeenMs: lastNs > 0 ? Math.floor(lastNs / 1_000_000) : 0,
      ...(typeof sample === 'string' && sample ? { sampleTraceId: sample } : {}),
      ...(typeof session === 'string' && session ? { sampleSessionId: session } : {}),
    }
  })
}

// Token count isn't monotonic with char length, so tokenize the longest-by-chars
// candidates (not just the single longest) and take the real max.
const MAX_TOKEN_CANDIDATES = 12
async function maxResultTokensByOp(
  p: OpenObserveProvider,
  where: string,
  limit: number,
  opts?: WindowOpts,
): Promise<Map<string, number>> {
  const size = limit * MAX_TOKEN_CANDIDATES
  const sql = `
    SELECT operation_name AS name, body FROM (
      SELECT
        operation_name,
        gen_ai_tool_call_result AS body,
        ROW_NUMBER() OVER (PARTITION BY operation_name ORDER BY LENGTH(gen_ai_tool_call_result) DESC) AS rn
      FROM "${p.stream}"
      WHERE ${where} AND gen_ai_tool_call_result IS NOT NULL
    ) WHERE rn <= ${MAX_TOKEN_CANDIDATES}
    LIMIT ${size}
  `
  const hits = await emptyIfColumnMissing(() => p.query(sql, { ...opts, size }))
  const out = new Map<string, number>()
  for (const h of hits) {
    const op = typeof h.name === 'string' ? h.name : ''
    const body = typeof h.body === 'string' ? h.body : ''
    if (!op || body.length === 0) continue
    const tokens = countTokens(body)
    if (tokens > (out.get(op) ?? 0)) out.set(op, tokens)
  }
  return out
}

// OO stores the body whole, so never truncated.
export async function fetchToolPayloadBody(p: OpenObserveProvider, spanId: string): Promise<RawPayloadBody | null> {
  if (!SPAN_ID_RE.test(spanId)) return null
  if (!(await p.getKnownColumns()).has('gen_ai_tool_call_result')) return null
  const sql = `
    SELECT gen_ai_tool_call_result AS body
    FROM "${p.stream}"
    WHERE span_id = ${sqlString(spanId)} AND gen_ai_tool_call_result IS NOT NULL
    LIMIT 1
  `
  const hits = await emptyIfColumnMissing(() => p.query(sql, { size: 1 }))
  const body = hits[0]?.body
  if (typeof body !== 'string') return null
  return { body, truncated: false }
}

export async function fetchToolRecentCalls(
  p: OpenObserveProvider,
  name: string,
  opts?: WindowOpts & { limit?: number },
): Promise<ToolCallSample[]> {
  if (!TOOL_NAME_RE.test(name)) return []
  const limit = opts?.limit ?? 50
  const known = await p.getKnownColumns()
  const sessionCols = ooColumns('sessionId', { known })
  const sessionExpr = sessionCols.length === 0 ? 'NULL' : `COALESCE(${sessionCols.join(', ')})`
  // Pull the body (not just LENGTH) so we can tokenize a real per-call count.
  const sql = `
    SELECT
      trace_id,
      span_id,
      ${sessionExpr} AS session_id,
      start_time,
      duration,
      span_status,
      ${known.has('gen_ai_tool_call_result') ? 'gen_ai_tool_call_result' : 'NULL'} AS result_body
    FROM "${p.stream}"
    WHERE operation_name = ${sqlString(`execute_tool ${name}`)}
    ORDER BY start_time DESC
    LIMIT ${limit}
  `
  const hits = await emptyIfColumnMissing(() => p.query(sql, { ...opts, size: limit }))
  return hits
    .map((h) => {
      const traceId = typeof h.trace_id === 'string' ? h.trace_id : ''
      if (!traceId) return null
      const sessionId = typeof h.session_id === 'string' && h.session_id ? h.session_id : undefined
      const spanId = typeof h.span_id === 'string' && h.span_id ? h.span_id : undefined
      const startNs = Number(h.start_time ?? 0)
      const sample: ToolCallSample = {
        traceId,
        startedAtMs: startNs > 0 ? Math.floor(startNs / 1_000_000) : 0,
        durationMs: Math.round((num(h.duration) ?? 0) / 1000),
        hasError: h.span_status === 'ERROR',
      }
      const body = typeof h.result_body === 'string' ? h.result_body : ''
      if (body.length > 0) {
        sample.resultChars = body.length
        sample.resultTokens = countTokens(body)
      }
      if (sessionId) sample.sessionId = sessionId
      if (spanId) sample.spanId = spanId
      return sample
    })
    .filter((s): s is ToolCallSample => s !== null)
}

export async function fetchToolPayloadOverTime(
  p: OpenObserveProvider,
  name: string,
  opts?: WindowOpts,
): Promise<ToolPayloadPoint[]> {
  if (!TOOL_NAME_RE.test(name)) return []
  if (!(await p.getKnownColumns()).has('gen_ai_tool_call_result')) return []
  const fromUs = opts?.fromUs ?? 0
  const toUs = opts?.toUs ?? 0
  const bucketSec = bucketSecondsFor(fromUs, toUs)
  const len = 'NULLIF(LENGTH(gen_ai_tool_call_result), 0)'
  const sql = `
    SELECT
      date_bin(INTERVAL '${bucketSec} seconds', to_timestamp_nanos(start_time)) AS bucket,
      approx_percentile_cont(${len}, 0.95) AS p95_chars,
      COUNT(*) AS count
    FROM "${p.stream}"
    WHERE operation_name = ${sqlString(`execute_tool ${name}`)}
    GROUP BY bucket
    ORDER BY bucket
  `
  const hits = await emptyIfColumnMissing(() => p.query(sql, { ...opts, size: 5000 }))
  return zeroFillBucketedAt(hits, fromUs, toUs, bucketSec, (h) => ({
    p95TokensEst: tokensFromChars(toCount(h.p95_chars)),
    calls: Number(h.count ?? 0),
  })).map((b) => ({ ts: b.ts, p95TokensEst: b.value.p95TokensEst, calls: b.value.calls }))
}

export async function fetchChatLatencyOverTime(p: OpenObserveProvider, opts?: WindowOpts): Promise<LatencyPoint[]> {
  const fromUs = opts?.fromUs ?? 0
  const toUs = opts?.toUs ?? 0
  const bucketSec = bucketSecondsFor(fromUs, toUs)
  const sql = `
    SELECT
      date_bin(INTERVAL '${bucketSec} seconds', to_timestamp_nanos(start_time)) AS bucket,
      approx_percentile_cont(duration, 0.5) / 1000 AS p50_ms,
      approx_percentile_cont(duration, 0.95) / 1000 AS p95_ms,
      COUNT(*) AS count
    FROM "${p.stream}"
    WHERE gen_ai_operation_name = 'chat'
    GROUP BY bucket
    ORDER BY bucket
  `
  const hits = await emptyIfColumnMissing(() => p.query(sql, { ...opts, size: 5000 }))
  return zeroFillBucketedAt(hits, fromUs, toUs, bucketSec, (h) => ({
    p50Ms: Math.round(num(h.p50_ms) ?? 0),
    p95Ms: Math.round(num(h.p95_ms) ?? 0),
    count: Number(h.count ?? 0),
  })).map((b) => ({ ts: b.ts, p50Ms: b.value.p50Ms, p95Ms: b.value.p95Ms, count: b.value.count }))
}

export async function fetchCacheHitRateOverTime(p: OpenObserveProvider, opts?: WindowOpts): Promise<CacheHitPoint[]> {
  const fromUs = opts?.fromUs ?? 0
  const toUs = opts?.toUs ?? 0
  const bucketSec = bucketSecondsFor(fromUs, toUs)
  const known = await p.getKnownColumns()
  const sumCols = (cols: readonly string[]) =>
    cols.length === 0
      ? '0'
      : cols.length === 1
        ? `SUM(COALESCE(${cols[0]}, 0))`
        : `SUM(COALESCE(${cols.join(', ')}, 0))`
  const cacheExpr = sumCols(ooColumns('cacheReadTokens', { known }))
  const inputExpr = sumCols(ooColumns('inputTokens', { known }))
  const sql = `
    SELECT
      date_bin(INTERVAL '${bucketSec} seconds', to_timestamp_nanos(start_time)) AS bucket,
      ${cacheExpr} AS cache_tokens,
      ${inputExpr} AS input_tokens
    FROM "${p.stream}"
    WHERE gen_ai_operation_name = 'chat'
    GROUP BY bucket
    ORDER BY bucket
  `
  const hits = await emptyIfColumnMissing(() => p.query(sql, { ...opts, size: 5000 }))
  return zeroFillBucketedAt(hits, fromUs, toUs, bucketSec, (h) => {
    const cache = num(h.cache_tokens) ?? 0
    const input = num(h.input_tokens) ?? 0
    return { ratio: input > 0 ? cache / input : 0, inputTokens: input }
  }).map((b) => ({ ts: b.ts, ratio: b.value.ratio, inputTokens: b.value.inputTokens }))
}

export async function fetchRunsPerHour(p: OpenObserveProvider, opts?: WindowOpts): Promise<RunsPoint[]> {
  const fromUs = opts?.fromUs ?? 0
  const toUs = opts?.toUs ?? 0
  const bucketSec = bucketSecondsFor(fromUs, toUs)
  const sql = `
    SELECT
      date_bin(INTERVAL '${bucketSec} seconds', to_timestamp_nanos(start_time)) AS bucket,
      COUNT(DISTINCT trace_id) AS runs
    FROM "${p.stream}"
    WHERE gen_ai_operation_name IS NOT NULL
       OR operation_name LIKE 'invoke_agent %'
       OR operation_name LIKE 'execute_tool %'
    GROUP BY bucket
    ORDER BY bucket
  `
  const hits = await emptyIfColumnMissing(() => p.query(sql, { ...opts, size: 5000 }))
  return zeroFillBucketedAt(hits, fromUs, toUs, bucketSec, (h) => ({ runs: Number(h.runs ?? 0) })).map((b) => ({
    ts: b.ts,
    runs: b.value.runs,
  }))
}

export async function fetchInventory(
  p: OpenObserveProvider,
  kind: InventoryDiscoveryKind,
  opts?: { fromUs?: number; toUs?: number },
): Promise<InventoryObservation[]> {
  const isTool = kind === 'new_tool'
  // Scope to a single deployment env when LOUPE_ENV is set (placeholder until producers emit deployment.environment).
  const env = process.env.LOUPE_ENV?.trim()
  const envFilter = (col: string) => (env ? ` AND ${col} = '${env.replace(/'/g, "''")}'` : '')
  // ever_nested=1: invoked under execute_tool at least once (a utility agent can
  // run both nested and top-level). Self-join the parent — DataFusion rejects
  // IN(subquery) inside CASE.
  const sql = isTool
    ? `
    SELECT
      operation_name,
      MIN(start_time) AS first_seen,
      MAX(start_time) AS last_seen,
      MIN(trace_id) AS sample_trace_id
    FROM "${p.stream}"
    WHERE operation_name LIKE 'execute_tool %'${envFilter('deployment_environment')}
    GROUP BY operation_name
    ORDER BY first_seen DESC
    LIMIT 1000
  `
    : `
    SELECT
      COALESCE(NULLIF(a.gen_ai_agent_name, ''), a.operation_name) AS operation_name,
      MAX(NULLIF(a.gen_ai_agent_name, '')) AS agent_name,
      MIN(a.start_time) AS first_seen,
      MAX(a.start_time) AS last_seen,
      MIN(a.trace_id) AS sample_trace_id,
      MAX(a.gen_ai_system_instructions) AS system_instructions,
      MAX(a.gen_ai_agent_description) AS description,
      MAX(CASE WHEN pp.operation_name LIKE 'execute_tool %' THEN 1 ELSE 0 END) AS ever_nested
    FROM "${p.stream}" a
    LEFT JOIN "${p.stream}" pp ON a.reference_parent_span_id = pp.span_id
    WHERE a.operation_name LIKE 'invoke_agent %'${envFilter('a.deployment_environment')}
    GROUP BY COALESCE(NULLIF(a.gen_ai_agent_name, ''), a.operation_name)
    ORDER BY first_seen DESC
    LIMIT 1000
  `
  const hits = await emptyIfColumnMissing(() => p.query(sql, { ...opts, size: 1000 }))
  return hits.map((hit) => hitToInventoryObservation(kind, hit)).filter((o): o is InventoryObservation => o !== null)
}

function hitToInventoryObservation(
  kind: InventoryDiscoveryKind,
  h: Record<string, unknown>,
): InventoryObservation | null {
  const operationName = String(h.operation_name ?? '')
  const isTool = kind === 'new_tool'
  // Agents: prefer the gen_ai.agent.name attribute. @ai-sdk/otel names the span
  // `invoke_agent <model>`, so the span name alone yields the model id, not the agent.
  const agentName = typeof h.agent_name === 'string' && h.agent_name ? h.agent_name : undefined
  const name = isTool ? extractToolName(operationName) : (agentName ?? extractAgentName(operationName))
  if (!name) return null
  const firstSeenNs = Number(h.first_seen ?? 0)
  const lastSeenNs = Number(h.last_seen ?? firstSeenNs)
  const systemPrompt = parseSystemInstructions(
    typeof h.system_instructions === 'string' ? h.system_instructions : undefined,
  )
  const description = typeof h.description === 'string' && h.description ? h.description : undefined
  return {
    kind: isTool ? 'mcp_tool' : 'agent',
    name,
    firstSeenMs: Math.floor(firstSeenNs / 1_000_000),
    lastSeenMs: Math.floor(lastSeenNs / 1_000_000),
    traceId: typeof h.sample_trace_id === 'string' ? h.sample_trace_id : undefined,
    ...(description ? { description } : {}),
    ...(systemPrompt ? { systemPrompt } : {}),
    ...(isTool ? {} : { nested: Number(h.ever_nested ?? 0) === 1 }),
  }
}

export async function fetchAgentMetrics(p: OpenObserveProvider, opts?: TopOpts): Promise<AgentMetrics[]> {
  const limit = opts?.limit ?? 1000
  const sql = `
    SELECT
      gen_ai_agent_name AS name,
      COUNT(*) AS calls,
      SUM(CASE WHEN span_status = 'ERROR' THEN 1 ELSE 0 END) AS errors,
      approx_percentile_cont(duration, 0.5) / 1000 AS p50_ms,
      approx_percentile_cont(duration, 0.95) / 1000 AS p95_ms
    FROM "${p.stream}"
    WHERE operation_name LIKE 'invoke_agent %' AND gen_ai_agent_name IS NOT NULL
    GROUP BY gen_ai_agent_name
    ORDER BY calls DESC
    LIMIT ${limit}
  `
  const hits = await emptyIfColumnMissing(() => p.query(sql, { ...opts, size: limit }))
  return hits.map((h) => {
    const calls = Number(h.calls ?? 0)
    const errors = Number(h.errors ?? 0)
    return {
      name: String(h.name ?? ''),
      calls,
      errorRate: calls > 0 ? errors / calls : 0,
      p50Ms: Math.round(num(h.p50_ms) ?? 0),
      p95Ms: Math.round(num(h.p95_ms) ?? 0),
    }
  })
}

// date_bin returns ISO string or epoch number depending on column type.
