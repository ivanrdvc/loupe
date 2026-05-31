import { extractAgentName, extractToolName } from '#/lib/spans/classify-span'
import { ooColumns } from './conventions'
import { mapToolErrorRow, mapToolPayloadRow, num } from './shared'
import { bucketSecondsFor, zeroFillBucketed } from './time-series'
import type {
  CacheHitPoint,
  InventoryDiscoveryKind,
  InventoryObservation,
  LatencyPoint,
  OpenObserveProvider,
  RunsPoint,
  ToolCallSample,
  ToolCatalogRow,
  ToolDetail,
  ToolErrorRow,
  ToolPayloadRow,
  TopOpts,
  WindowOpts,
} from './types'

const TOOL_NAME_RE = /^[A-Za-z0-9_./:-]+$/

// 20004 = column not in stream yet (fresh ingest). Treat as empty.
async function emptyOn20004<T>(run: () => Promise<T[]>): Promise<T[]> {
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
  const hits = await emptyOn20004(() => p.query(sql, { ...opts, size: limit }))
  return hits.map(mapToolErrorRow)
}

export async function fetchToolPayloadSizes(p: OpenObserveProvider, opts?: TopOpts): Promise<ToolPayloadRow[]> {
  const limit = opts?.limit ?? 5
  const known = await p.getKnownColumns()
  const sessionCols = ooColumns('sessionId', { known })
  const sessionExpr = sessionCols.length === 0 ? 'NULL' : `MAX(COALESCE(${sessionCols.join(', ')}))`
  const sql = `
    SELECT
      operation_name AS name,
      AVG(LENGTH(gen_ai_tool_call_result)) AS avg_chars,
      approx_percentile_cont(LENGTH(gen_ai_tool_call_result), 0.95) AS p95_chars,
      MAX(LENGTH(gen_ai_tool_call_result)) AS max_chars,
      COUNT(*) AS count,
      MAX(trace_id) AS sample_trace_id,
      ${sessionExpr} AS sample_session_id
    FROM "${p.stream}"
    WHERE operation_name LIKE 'execute_tool %'
      AND gen_ai_tool_call_result IS NOT NULL
    GROUP BY operation_name
    ORDER BY p95_chars DESC
    LIMIT ${limit}
  `
  const hits = await emptyOn20004(() => p.query(sql, { ...opts, size: limit }))
  return hits.map(mapToolPayloadRow)
}

export async function fetchAllTools(p: OpenObserveProvider, opts?: TopOpts): Promise<ToolCatalogRow[]> {
  const limit = opts?.limit ?? 1000
  const sql = `
    SELECT
      operation_name AS name,
      COUNT(*) AS calls,
      SUM(CASE WHEN span_status = 'ERROR' THEN 1 ELSE 0 END) AS errors,
      AVG(NULLIF(LENGTH(gen_ai_tool_call_result), 0)) AS avg_chars,
      approx_percentile_cont(NULLIF(LENGTH(gen_ai_tool_call_result), 0), 0.95) AS p95_chars,
      approx_percentile_cont(duration, 0.5) / 1000 AS p50_ms,
      approx_percentile_cont(duration, 0.95) / 1000 AS p95_ms,
      MAX(start_time) AS last_seen_ns
    FROM "${p.stream}"
    WHERE operation_name LIKE 'execute_tool %'
    GROUP BY operation_name
    ORDER BY calls DESC
    LIMIT ${limit}
  `
  const hits = await emptyOn20004(() => p.query(sql, { ...opts, size: limit }))
  return hits.map((h) => {
    const calls = Number(h.calls ?? 0)
    const errors = Number(h.errors ?? 0)
    const raw = String(h.name ?? '')
    const lastNs = Number(h.last_seen_ns ?? 0)
    return {
      name: raw.startsWith('execute_tool ') ? raw.slice('execute_tool '.length) : raw,
      calls,
      errors,
      errorRate: calls > 0 ? errors / calls : 0,
      avgChars: Math.round(num(h.avg_chars) ?? 0),
      p95Chars: Math.round(num(h.p95_chars) ?? 0),
      p50Ms: Math.round(num(h.p50_ms) ?? 0),
      p95Ms: Math.round(num(h.p95_ms) ?? 0),
      lastSeenMs: lastNs > 0 ? Math.floor(lastNs / 1_000_000) : 0,
    }
  })
}

export async function fetchToolDetail(
  p: OpenObserveProvider,
  name: string,
  opts?: WindowOpts,
): Promise<ToolDetail | null> {
  if (!TOOL_NAME_RE.test(name)) return null
  const sql = `
    SELECT
      COUNT(*) AS calls,
      SUM(CASE WHEN span_status = 'ERROR' THEN 1 ELSE 0 END) AS errors,
      AVG(NULLIF(LENGTH(gen_ai_tool_call_result), 0)) AS avg_chars,
      approx_percentile_cont(NULLIF(LENGTH(gen_ai_tool_call_result), 0), 0.95) AS p95_chars,
      MAX(LENGTH(gen_ai_tool_call_result)) AS max_chars,
      approx_percentile_cont(duration, 0.5) / 1000 AS p50_ms,
      approx_percentile_cont(duration, 0.95) / 1000 AS p95_ms,
      MIN(start_time) AS first_seen_ns,
      MAX(start_time) AS last_seen_ns
    FROM "${p.stream}"
    WHERE operation_name = 'execute_tool ${name}'
  `
  const hits = await emptyOn20004(() => p.query(sql, { ...opts, size: 1 }))
  const h = hits[0]
  const calls = Number(h?.calls ?? 0)
  if (!h || calls === 0) return null
  const errors = Number(h.errors ?? 0)
  const firstNs = Number(h.first_seen_ns ?? 0)
  const lastNs = Number(h.last_seen_ns ?? 0)
  return {
    name,
    calls,
    errors,
    errorRate: errors / calls,
    avgChars: Math.round(num(h.avg_chars) ?? 0),
    p95Chars: Math.round(num(h.p95_chars) ?? 0),
    maxChars: Math.round(num(h.max_chars) ?? 0),
    p50Ms: Math.round(num(h.p50_ms) ?? 0),
    p95Ms: Math.round(num(h.p95_ms) ?? 0),
    firstSeenMs: firstNs > 0 ? Math.floor(firstNs / 1_000_000) : 0,
    lastSeenMs: lastNs > 0 ? Math.floor(lastNs / 1_000_000) : 0,
  }
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
  const sql = `
    SELECT
      trace_id,
      ${sessionExpr} AS session_id,
      start_time,
      duration,
      span_status
    FROM "${p.stream}"
    WHERE operation_name = 'execute_tool ${name}'
    ORDER BY start_time DESC
    LIMIT ${limit}
  `
  const hits = await emptyOn20004(() => p.query(sql, { ...opts, size: limit }))
  return hits
    .map((h) => {
      const traceId = typeof h.trace_id === 'string' ? h.trace_id : ''
      if (!traceId) return null
      const sessionId = typeof h.session_id === 'string' && h.session_id ? h.session_id : undefined
      const startNs = Number(h.start_time ?? 0)
      const sample: ToolCallSample = {
        traceId,
        startedAtMs: startNs > 0 ? Math.floor(startNs / 1_000_000) : 0,
        durationMs: Math.round((num(h.duration) ?? 0) / 1000),
        hasError: h.span_status === 'ERROR',
      }
      if (sessionId) sample.sessionId = sessionId
      return sample
    })
    .filter((s): s is ToolCallSample => s !== null)
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
  const hits = await emptyOn20004(() => p.query(sql, { ...opts, size: 5000 }))
  return zeroFillPoints(hits, fromUs, toUs, bucketSec, (h) => ({
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
  const hits = await emptyOn20004(() => p.query(sql, { ...opts, size: 5000 }))
  return zeroFillPoints(hits, fromUs, toUs, bucketSec, (h) => {
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
  const hits = await emptyOn20004(() => p.query(sql, { ...opts, size: 5000 }))
  return zeroFillPoints(hits, fromUs, toUs, bucketSec, (h) => ({ runs: Number(h.runs ?? 0) })).map((b) => ({
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
  const sql = `
    SELECT
      operation_name,
      MIN(start_time) AS first_seen,
      MAX(start_time) AS last_seen,
      MIN(trace_id) AS sample_trace_id
    FROM "${p.stream}"
    WHERE operation_name LIKE '${isTool ? 'execute_tool' : 'invoke_agent'} %'
    GROUP BY operation_name
    ORDER BY first_seen DESC
    LIMIT 1000
  `
  const hits = await p.query(sql, { ...opts, size: 1000 })
  return hits.map((hit) => hitToInventoryObservation(kind, hit)).filter((o): o is InventoryObservation => o !== null)
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

// date_bin returns ISO string or epoch number depending on column type.
function parseBucketMs(raw: unknown): number | undefined {
  if (typeof raw === 'number') return raw < 1e12 ? raw * 1000 : raw
  if (typeof raw === 'string') {
    const ms = Date.parse(raw.endsWith('Z') ? raw : `${raw}Z`)
    return Number.isFinite(ms) ? ms : undefined
  }
  return undefined
}

function zeroFillPoints<V>(
  hits: Array<Record<string, unknown>>,
  fromUs: number,
  toUs: number,
  bucketSec: number,
  mapValue: (h: Record<string, unknown>) => V,
): Array<{ ts: number; value: V }> {
  return zeroFillBucketed(hits, fromUs, toUs, bucketSec, (h) => parseBucketMs(h.bucket), mapValue)
}
