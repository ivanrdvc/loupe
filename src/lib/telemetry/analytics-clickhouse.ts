import { tokensFromChars } from '#/lib/format'
import { extractAgentName, extractToolName, parseSystemInstructions } from '#/lib/spans/classify-span'
import { countTokens } from '#/lib/tokens'
import { CH_ERROR_WHERE, CH_TIME_WHERE, chString } from './clickhouse'
import { chCol } from './conventions'
import { mapToolErrorRow, num, SPAN_ID_RE, TOOL_NAME_RE, toCount } from './shared'
import { bucketSecondsFor, zeroFillBucketedAt } from './time-series'
import type {
  AgentMetrics,
  CacheHitPoint,
  ClickHouseProvider,
  InventoryDiscoveryKind,
  InventoryObservation,
  LatencyPoint,
  RawPayloadBody,
  RunsPoint,
  ToolCallSample,
  ToolErrorRow,
  ToolListOpts,
  ToolPayloadPoint,
  ToolRow,
  ToolSortColumn,
  TopOpts,
  WindowOpts,
} from './types'

const BODY = "SpanAttributes['gen_ai.tool.call.result']"
const DURATION_MS = 'intDiv(Duration, 1000000)'
const START_MS = 'toUnixTimestamp64Milli(Timestamp)'

// ToolSortColumn → an ORDER BY expression over the aggregate SELECT's aliases.
// Token estimates sort on their char proxy (monotonic with tokensFromChars).
const TOOL_SORT_SQL: Record<ToolSortColumn, string> = {
  name: 'name',
  calls: 'calls',
  errorRate: 'errors / calls',
  p95Ms: 'p95_ms',
  avgTokensEst: 'avg_chars',
  p95TokensEst: 'p95_chars',
  maxTokens: 'max_chars',
  totalTokensEst: 'total_chars',
  lastSeenMs: 'last_seen_ms',
}

export async function fetchToolErrorRates(p: ClickHouseProvider, opts?: TopOpts): Promise<ToolErrorRow[]> {
  const limit = opts?.limit ?? 5
  const sql = `
    SELECT
      SpanName AS name,
      countIf(${CH_ERROR_WHERE}) AS errors,
      count() AS total,
      maxIf(TraceId, ${CH_ERROR_WHERE}) AS last_error_trace_id
    FROM ${p.table}
    WHERE SpanName LIKE 'execute_tool %' AND ${CH_TIME_WHERE}
    GROUP BY SpanName
    HAVING errors > 0
    ORDER BY errors / total DESC
    LIMIT ${limit}
  `
  const hits = await p.query(sql, { ...opts, size: limit })
  return hits.map(mapToolErrorRow)
}

export async function fetchTools(p: ClickHouseProvider, opts?: ToolListOpts): Promise<ToolRow[]> {
  const name = opts?.name
  if (name !== undefined && !TOOL_NAME_RE.test(name)) return []
  const limit = name !== undefined ? 1 : (opts?.limit ?? 1000)
  const offset = name !== undefined ? 0 : Math.max(0, opts?.offset ?? 0)
  const orderExpr = opts?.sortBy ? TOOL_SORT_SQL[opts.sortBy] : 'calls'
  const orderDir = opts?.sortDir === 'asc' ? 'ASC' : 'DESC'
  const nameWhere =
    name !== undefined ? `SpanName = ${chString(`execute_tool ${name}`)}` : `SpanName LIKE 'execute_tool %'`
  const dimWhere = (opts?.dimensions ?? []).map((d) => ` AND ${chCol(d.field)} = ${chString(d.value)}`).join('')
  const sql = `
    SELECT
      SpanName AS name,
      count() AS calls,
      countIf(ToolResultChars > 0) AS calls_with_result,
      countIf(${CH_ERROR_WHERE}) AS errors,
      avgIf(ToolResultChars, ToolResultChars > 0) AS avg_chars,
      quantileIf(0.5)(ToolResultChars, ToolResultChars > 0) AS p50_chars,
      quantileIf(0.95)(ToolResultChars, ToolResultChars > 0) AS p95_chars,
      max(ToolResultChars) AS max_chars,
      sum(ToolResultChars) AS total_chars,
      quantile(0.5)(${DURATION_MS}) AS p50_ms,
      quantile(0.95)(${DURATION_MS}) AS p95_ms,
      min(${START_MS}) AS first_seen_ms,
      max(${START_MS}) AS last_seen_ms,
      max(TraceId) AS sample_trace_id,
      max(SessionId) AS sample_session_id
    FROM ${p.table}
    WHERE ${nameWhere}${dimWhere} AND ${CH_TIME_WHERE}
    GROUP BY SpanName
    ORDER BY ${orderExpr} ${orderDir}
    LIMIT ${limit} OFFSET ${offset}
  `
  const hits = await p.query(sql, { ...opts, size: limit })
  const maxResults = await maxResultTokensByOp(p, `${nameWhere}${dimWhere}`, limit, name !== undefined, opts)
  return hits.map((h) => {
    const calls = Number(h.calls ?? 0)
    const errors = Number(h.errors ?? 0)
    const raw = String(h.name ?? '')
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
      maxTokens: maxResults.tokens.get(raw) ?? tokensFromChars(toCount(h.max_chars)),
      maxTokensEst:
        name === undefined ||
        !maxResults.tokens.has(raw) ||
        maxResults.scanned.get(raw) !== Number(h.calls_with_result ?? 0),
      totalTokensEst: tokensFromChars(toCount(h.total_chars)),
      p50Ms: Math.round(num(h.p50_ms) ?? 0),
      p95Ms: Math.round(num(h.p95_ms) ?? 0),
      firstSeenMs: Number(h.first_seen_ms ?? 0),
      lastSeenMs: Number(h.last_seen_ms ?? 0),
      ...(typeof sample === 'string' && sample ? { sampleTraceId: sample } : {}),
      ...(typeof session === 'string' && session ? { sampleSessionId: session } : {}),
    }
  })
}

// Token count isn't monotonic with char length, so tokenize the longest-by-chars
// candidates and take the real max (same contract as the OO module).
const MAX_TOKEN_CANDIDATES = 12
const MAX_EXACT_TOOL_RESULTS = 100_000
async function maxResultTokensByOp(
  p: ClickHouseProvider,
  where: string,
  limit: number,
  singleTool: boolean,
  opts?: WindowOpts,
): Promise<{ tokens: Map<string, number>; scanned: Map<string, number> }> {
  const size = limit * MAX_TOKEN_CANDIDATES
  let charsGate = ''
  if (!singleTool) {
    // Bodies live in the attr map, so every candidate row drags the whole map
    // from disk. Gate on the promoted chars column: only rows that could make
    // some tool's top-N (≥ the smallest per-tool Nth-largest size) read the map.
    const th = await p.query(
      `SELECT min(t) AS gate FROM (
         SELECT arrayElement(arrayReverseSort(groupArrayIf(ToolResultChars, ToolResultChars > 0)),
                toUInt32(least(${MAX_TOKEN_CANDIDATES}, countIf(ToolResultChars > 0)))) AS t
         FROM ${p.table}
         WHERE ${where} AND ${CH_TIME_WHERE}
         GROUP BY SpanName
         HAVING countIf(ToolResultChars > 0) > 0
       )`,
      { ...opts, size: 1 },
    )
    const gate = num(th[0]?.gate)
    if (gate === undefined) return { tokens: new Map(), scanned: new Map() }
    charsGate = ` AND ToolResultChars >= ${Math.max(1, Math.floor(gate))}`
  }
  // Small blocks + one thread: body rows stream instead of piling up in
  // parallel read-ahead buffers (each row drags the whole attr map).
  const stream = 'SETTINGS max_threads = 1, max_block_size = 2048'
  let sql: string
  if (singleTool) {
    sql = `
    SELECT SpanName AS name, ${BODY} AS body
    FROM ${p.table}
    WHERE ${where} AND ToolResultChars > 0 AND ${CH_TIME_WHERE}
    LIMIT ${MAX_EXACT_TOOL_RESULTS}
    ${stream}
  `
  } else {
    // Rank candidates on the promoted chars column alone (bodies would make
    // the window sort hold every candidate body in memory), then fetch only
    // the winners' bodies via the span-id bloom index.
    const idRows = await p.query(
      `SELECT span_id FROM (
         SELECT SpanId AS span_id,
           row_number() OVER (PARTITION BY SpanName ORDER BY ToolResultChars DESC) AS rn
         FROM ${p.table}
         WHERE ${where} AND ToolResultChars > 0${charsGate} AND ${CH_TIME_WHERE}
       ) WHERE rn <= ${MAX_TOKEN_CANDIDATES}
       LIMIT ${size}`,
      { ...opts, size },
    )
    const ids = idRows.map((r) => r.span_id).filter((v): v is string => typeof v === 'string' && SPAN_ID_RE.test(v))
    if (ids.length === 0) return { tokens: new Map(), scanned: new Map() }
    sql = `
    SELECT SpanName AS name, ${BODY} AS body
    FROM ${p.table}
    WHERE SpanId IN (${ids.map(chString).join(', ')}) AND ${CH_TIME_WHERE}
    LIMIT ${size}
    ${stream}
  `
  }
  const hits = await p.query(sql, { ...opts, size: singleTool ? MAX_EXACT_TOOL_RESULTS : size })
  const out = new Map<string, number>()
  const scanned = new Map<string, number>()
  for (const h of hits) {
    const op = typeof h.name === 'string' ? h.name : ''
    const body = typeof h.body === 'string' ? h.body : ''
    if (!op || body.length === 0) continue
    scanned.set(op, (scanned.get(op) ?? 0) + 1)
    const tokens = countTokens(body)
    if (tokens > (out.get(op) ?? 0)) out.set(op, tokens)
  }
  return { tokens: out, scanned }
}

// ClickHouse stores the body whole, so never truncated.
export async function fetchToolPayloadBody(p: ClickHouseProvider, spanId: string): Promise<RawPayloadBody | null> {
  if (!SPAN_ID_RE.test(spanId)) return null
  const sql = `
    SELECT ${BODY} AS body
    FROM ${p.table}
    WHERE SpanId = ${chString(spanId)} AND ToolResultChars > 0 AND ${CH_TIME_WHERE}
    LIMIT 1
  `
  const hits = await p.query(sql, { size: 1 })
  const body = hits[0]?.body
  if (typeof body !== 'string' || body.length === 0) return null
  return { body, truncated: false }
}

export async function fetchToolRecentCalls(
  p: ClickHouseProvider,
  name: string,
  opts?: WindowOpts & { limit?: number },
): Promise<ToolCallSample[]> {
  if (!TOOL_NAME_RE.test(name)) return []
  const limit = opts?.limit ?? 50
  const sql = `
    SELECT
      TraceId AS trace_id,
      SpanId AS span_id,
      SessionId AS session_id,
      ${START_MS} AS start_ms,
      ${DURATION_MS} AS duration_ms,
      if(${CH_ERROR_WHERE}, 'ERROR', '') AS span_status,
      ${BODY} AS result_body
    FROM ${p.table}
    WHERE SpanName = ${chString(`execute_tool ${name}`)} AND ${CH_TIME_WHERE}
    ORDER BY Timestamp DESC
    LIMIT ${limit}
  `
  const hits = await p.query(sql, { ...opts, size: limit })
  return hits
    .map((h) => {
      const traceId = typeof h.trace_id === 'string' ? h.trace_id : ''
      if (!traceId) return null
      const sample: ToolCallSample = {
        traceId,
        startedAtMs: Number(h.start_ms ?? 0),
        durationMs: Math.max(0, Number(h.duration_ms ?? 0)),
        hasError: h.span_status === 'ERROR',
      }
      const body = typeof h.result_body === 'string' ? h.result_body : ''
      if (body.length > 0) {
        sample.resultChars = body.length
        sample.resultTokens = countTokens(body)
      }
      if (typeof h.session_id === 'string' && h.session_id) sample.sessionId = h.session_id
      if (typeof h.span_id === 'string' && h.span_id) sample.spanId = h.span_id
      return sample
    })
    .filter((s): s is ToolCallSample => s !== null)
}

function bucketExpr(bucketSec: number): string {
  return `toUnixTimestamp(toStartOfInterval(Timestamp, INTERVAL ${bucketSec} SECOND)) AS bucket`
}

export async function fetchToolPayloadOverTime(
  p: ClickHouseProvider,
  name: string,
  opts?: WindowOpts,
): Promise<ToolPayloadPoint[]> {
  if (!TOOL_NAME_RE.test(name)) return []
  const fromUs = opts?.fromUs ?? 0
  const toUs = opts?.toUs ?? 0
  const bucketSec = bucketSecondsFor(fromUs, toUs)
  const sql = `
    SELECT
      ${bucketExpr(bucketSec)},
      quantileIf(0.95)(ToolResultChars, ToolResultChars > 0) AS p95_chars,
      count() AS count
    FROM ${p.table}
    WHERE SpanName = ${chString(`execute_tool ${name}`)} AND ${CH_TIME_WHERE}
    GROUP BY bucket
    ORDER BY bucket
  `
  const hits = await p.query(sql, { ...opts, size: 5000 })
  return zeroFillBucketedAt(hits, fromUs, toUs, bucketSec, (h) => ({
    p95TokensEst: tokensFromChars(toCount(h.p95_chars)),
    calls: Number(h.count ?? 0),
  })).map((b) => ({ ts: b.ts, p95TokensEst: b.value.p95TokensEst, calls: b.value.calls }))
}

export async function fetchChatLatencyOverTime(p: ClickHouseProvider, opts?: WindowOpts): Promise<LatencyPoint[]> {
  const fromUs = opts?.fromUs ?? 0
  const toUs = opts?.toUs ?? 0
  const bucketSec = bucketSecondsFor(fromUs, toUs)
  const sql = `
    SELECT
      ${bucketExpr(bucketSec)},
      quantile(0.5)(${DURATION_MS}) AS p50_ms,
      quantile(0.95)(${DURATION_MS}) AS p95_ms,
      count() AS count
    FROM ${p.table}
    WHERE GenAiOperation = 'chat' AND ${CH_TIME_WHERE}
    GROUP BY bucket
    ORDER BY bucket
  `
  const hits = await p.query(sql, { ...opts, size: 5000 })
  return zeroFillBucketedAt(hits, fromUs, toUs, bucketSec, (h) => ({
    p50Ms: Math.round(num(h.p50_ms) ?? 0),
    p95Ms: Math.round(num(h.p95_ms) ?? 0),
    count: Number(h.count ?? 0),
  })).map((b) => ({ ts: b.ts, p50Ms: b.value.p50Ms, p95Ms: b.value.p95Ms, count: b.value.count }))
}

export async function fetchCacheHitRateOverTime(p: ClickHouseProvider, opts?: WindowOpts): Promise<CacheHitPoint[]> {
  const fromUs = opts?.fromUs ?? 0
  const toUs = opts?.toUs ?? 0
  const bucketSec = bucketSecondsFor(fromUs, toUs)
  const sql = `
    SELECT
      ${bucketExpr(bucketSec)},
      sum(CacheReadTokens) AS cache_tokens,
      sum(InputTokens) AS input_tokens
    FROM ${p.table}
    WHERE GenAiOperation = 'chat' AND ${CH_TIME_WHERE}
    GROUP BY bucket
    ORDER BY bucket
  `
  const hits = await p.query(sql, { ...opts, size: 5000 })
  return zeroFillBucketedAt(hits, fromUs, toUs, bucketSec, (h) => {
    const cache = num(h.cache_tokens) ?? 0
    const input = num(h.input_tokens) ?? 0
    return { ratio: input > 0 ? cache / input : 0, inputTokens: input }
  }).map((b) => ({ ts: b.ts, ratio: b.value.ratio, inputTokens: b.value.inputTokens }))
}

export async function fetchRunsPerHour(p: ClickHouseProvider, opts?: WindowOpts): Promise<RunsPoint[]> {
  const fromUs = opts?.fromUs ?? 0
  const toUs = opts?.toUs ?? 0
  const bucketSec = bucketSecondsFor(fromUs, toUs)
  const sql = `
    SELECT
      ${bucketExpr(bucketSec)},
      uniqExact(TraceId) AS runs
    FROM ${p.table}
    WHERE (GenAiOperation != ''
       OR SpanName LIKE 'invoke_agent %'
       OR SpanName LIKE 'execute_tool %')
      AND ${CH_TIME_WHERE}
    GROUP BY bucket
    ORDER BY bucket
  `
  const hits = await p.query(sql, { ...opts, size: 5000 })
  return zeroFillBucketedAt(hits, fromUs, toUs, bucketSec, (h) => ({ runs: Number(h.runs ?? 0) })).map((b) => ({
    ts: b.ts,
    runs: b.value.runs,
  }))
}

export async function fetchInventory(
  p: ClickHouseProvider,
  kind: InventoryDiscoveryKind,
  opts?: { fromUs?: number; toUs?: number },
): Promise<InventoryObservation[]> {
  const isTool = kind === 'new_tool'
  const env = process.env.LOUPE_ENV?.trim()
  const envWhere = env ? ` AND DeploymentEnv = ${chString(env)}` : ''
  const sql = isTool
    ? `
    SELECT
      SpanName AS operation_name,
      min(${START_MS}) AS first_seen_ms,
      max(${START_MS}) AS last_seen_ms,
      min(TraceId) AS sample_trace_id
    FROM ${p.table}
    WHERE SpanName LIKE 'execute_tool %'${envWhere} AND ${CH_TIME_WHERE}
    GROUP BY SpanName
    ORDER BY first_seen_ms DESC
    LIMIT 1000
  `
    : `
    SELECT
      if(AgentName != '', AgentName, SpanName) AS operation_name,
      max(AgentName) AS agent_name,
      min(${START_MS}) AS first_seen_ms,
      max(${START_MS}) AS last_seen_ms,
      min(TraceId) AS sample_trace_id,
      max(SpanAttributes['gen_ai.system_instructions']) AS system_instructions,
      max(SpanAttributes['gen_ai.agent.description']) AS description,
      max(ParentSpanId IN (
        SELECT SpanId FROM ${p.table} WHERE SpanName LIKE 'execute_tool %' AND ${CH_TIME_WHERE}
      )) AS ever_nested
    FROM ${p.table}
    WHERE SpanName LIKE 'invoke_agent %'${envWhere} AND ${CH_TIME_WHERE}
    GROUP BY operation_name
    ORDER BY first_seen_ms DESC
    LIMIT 1000
  `
  const hits = await p.query(sql, { ...opts, size: 1000 })
  return hits.map((h) => hitToInventoryObservation(kind, h)).filter((o): o is InventoryObservation => o !== null)
}

function hitToInventoryObservation(
  kind: InventoryDiscoveryKind,
  h: Record<string, unknown>,
): InventoryObservation | null {
  const operationName = String(h.operation_name ?? '')
  const isTool = kind === 'new_tool'
  const agentName = typeof h.agent_name === 'string' && h.agent_name ? h.agent_name : undefined
  const name = isTool ? extractToolName(operationName) : (agentName ?? extractAgentName(operationName))
  if (!name) return null
  const firstSeenMs = Number(h.first_seen_ms ?? 0)
  const systemPrompt = parseSystemInstructions(
    typeof h.system_instructions === 'string' && h.system_instructions ? h.system_instructions : undefined,
  )
  const description = typeof h.description === 'string' && h.description ? h.description : undefined
  return {
    kind: isTool ? 'mcp_tool' : 'agent',
    name,
    firstSeenMs,
    lastSeenMs: Number(h.last_seen_ms ?? firstSeenMs),
    traceId: typeof h.sample_trace_id === 'string' && h.sample_trace_id ? h.sample_trace_id : undefined,
    ...(description ? { description } : {}),
    ...(systemPrompt ? { systemPrompt } : {}),
    ...(isTool ? {} : { nested: Number(h.ever_nested ?? 0) === 1 }),
  }
}

export async function fetchAgentMetrics(p: ClickHouseProvider, opts?: TopOpts): Promise<AgentMetrics[]> {
  const limit = opts?.limit ?? 1000
  const sql = `
    SELECT
      AgentName AS name,
      argMax(Model, Timestamp) AS model,
      count() AS calls,
      countIf(${CH_ERROR_WHERE}) AS errors,
      quantile(0.5)(${DURATION_MS}) AS p50_ms,
      quantile(0.95)(${DURATION_MS}) AS p95_ms
    FROM ${p.table}
    WHERE SpanName LIKE 'invoke_agent %' AND AgentName != '' AND ${CH_TIME_WHERE}
    GROUP BY AgentName
    ORDER BY calls DESC
    LIMIT ${limit}
  `
  const hits = await p.query(sql, { ...opts, size: limit })
  return hits.map((h) => {
    const calls = Number(h.calls ?? 0)
    const errors = Number(h.errors ?? 0)
    return {
      name: String(h.name ?? ''),
      model: h.model ? String(h.model) : undefined,
      calls,
      errorRate: calls > 0 ? errors / calls : 0,
      p50Ms: Math.round(num(h.p50_ms) ?? 0),
      p95Ms: Math.round(num(h.p95_ms) ?? 0),
    }
  })
}
