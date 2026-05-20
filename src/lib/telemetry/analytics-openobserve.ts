import { extractAgentName, extractToolName } from '#/lib/classify-span'
import { ooColumns } from './conventions'
import { mapToolErrorRow, mapToolPayloadRow, num } from './shared'
import { bucketSecondsFor, zeroFillBucketed } from './time-series'
import type {
  CacheHitPoint,
  InventoryDiscoveryKind,
  InventoryObservation,
  LatencyPoint,
  OpenObserveProvider,
  OverviewAggregate,
  OverviewOpts,
  RunsPoint,
  ToolErrorRow,
  ToolPayloadRow,
  TopOpts,
  WindowOpts,
} from './types'

// 20004 = column not in stream yet (fresh ingest). Treat as empty.
async function emptyOn20004<T>(run: () => Promise<T[]>): Promise<T[]> {
  try {
    return await run()
  } catch (e) {
    if (e instanceof Error && e.message.includes('"code":20004')) return []
    throw e
  }
}

export async function fetchOverview(p: OpenObserveProvider, opts?: OverviewOpts): Promise<OverviewAggregate> {
  const sql = `
    SELECT
      COUNT(DISTINCT trace_id) AS runs,
      COUNT(DISTINCT CASE WHEN span_status = 'ERROR' THEN trace_id END) AS errored_runs,
      approx_percentile_cont(CASE WHEN gen_ai_operation_name = 'chat' THEN duration END, 0.95) / 1000 AS p95_chat_ms,
      SUM(CASE WHEN gen_ai_operation_name = 'chat' THEN llm_usage_cost_total ELSE 0 END) AS total_cost
    FROM "${p.stream}"
    WHERE gen_ai_operation_name IS NOT NULL
       OR operation_name LIKE 'execute_tool %'
       OR operation_name LIKE 'invoke_agent %'
  `
  const hits = await emptyOn20004(() => p.query(sql, { ...opts, size: 1 }))
  const row = hits[0] ?? {}
  return {
    runs: Number(row.runs ?? 0),
    erroredRuns: Number(row.errored_runs ?? 0),
    p95ChatMs: Math.round(Number(row.p95_chat_ms ?? 0)),
    totalCostUsd: Number(row.total_cost ?? 0),
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
  const sql = `
    SELECT
      operation_name AS name,
      AVG(LENGTH(gen_ai_tool_call_result)) AS avg_chars,
      approx_percentile_cont(LENGTH(gen_ai_tool_call_result), 0.95) AS p95_chars,
      MAX(LENGTH(gen_ai_tool_call_result)) AS max_chars,
      COUNT(*) AS count,
      MAX(trace_id) AS sample_trace_id
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
