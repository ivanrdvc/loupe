import { extractAgentName, extractToolName } from '#/lib/classify-span'
import { estimateCostUsd } from '#/lib/llm-pricing'
import { aiCoalesce } from './conventions'
import { mapToolErrorRow, mapToolPayloadRow, num } from './shared'
import { bucketSecondsFor, zeroFillBucketed } from './time-series'
import type {
  AppInsightsProvider,
  CacheHitPoint,
  InventoryDiscoveryKind,
  InventoryObservation,
  LatencyPoint,
  OverviewAggregate,
  OverviewOpts,
  RunsPoint,
  ToolErrorRow,
  ToolPayloadRow,
  TopOpts,
  WindowOpts,
} from './types'

export async function fetchOverview(p: AppInsightsProvider, opts?: OverviewOpts): Promise<OverviewAggregate> {
  // Cost is computed in TS via estimateCostUsd, mirroring listTraces in app-insights.ts.
  const aggQ = `
    union dependencies, requests
    | extend gen_op = tostring(customDimensions["gen_ai.operation.name"])
    | where isnotempty(gen_op) or name startswith "invoke_agent " or name startswith "execute_tool "
    | summarize
        runs = dcount(operation_Id),
        errored_runs = dcountif(operation_Id, success == false),
        p95_chat_ms = percentile(iff(gen_op == "chat", duration, real(null)), 95)
  `
  const costQ = `
    union dependencies, requests
    | where tostring(customDimensions["gen_ai.operation.name"]) == "chat"
    | extend
        in_tok    = toint(customDimensions["gen_ai.usage.input_tokens"]),
        out_tok   = toint(customDimensions["gen_ai.usage.output_tokens"]),
        cache_tok = toint(customDimensions["gen_ai.usage.cache_read.input_tokens"]),
        model_id  = tostring(customDimensions["gen_ai.request.model"]),
        provider  = tostring(customDimensions["gen_ai.provider.name"]),
        ts_ms     = tolong(datetime_diff('millisecond', timestamp, datetime(1970-01-01)))
    | summarize
        in_tok = sum(in_tok),
        out_tok = sum(out_tok),
        cache_tok = sum(cache_tok),
        ts_ms = min(ts_ms)
      by model_id, provider
  `
  const [aggRows, costRows] = await Promise.all([p.query(aggQ, opts ?? {}), p.query(costQ, opts ?? {})])
  const agg = aggRows[0] ?? {}
  let totalCost = 0
  for (const r of costRows) {
    const cost = estimateCostUsd({
      model: typeof r.model_id === 'string' ? r.model_id : undefined,
      inputTokens: num(r.in_tok),
      outputTokens: num(r.out_tok),
      cachedInputTokens: num(r.cache_tok),
      provider: typeof r.provider === 'string' ? r.provider : undefined,
      spanStartMs: num(r.ts_ms),
    })
    if (cost) totalCost += cost
  }
  return {
    runs: Number(agg.runs ?? 0),
    erroredRuns: Number(agg.errored_runs ?? 0),
    p95ChatMs: Math.round(num(agg.p95_chat_ms) ?? 0),
    totalCostUsd: totalCost,
  }
}

export async function fetchToolErrorRates(p: AppInsightsProvider, opts?: TopOpts): Promise<ToolErrorRow[]> {
  const limit = opts?.limit ?? 5
  const q = `
    union dependencies, requests
    | where name startswith "execute_tool "
    | summarize
        errors = countif(success == false),
        total = count(),
        last_error_trace_id = take_anyif(operation_Id, success == false)
      by name
    | where errors > 0
    | top ${limit} by todouble(errors) / total
    | project name, errors, total, last_error_trace_id
  `
  const rows = await p.query(q, opts ?? {})
  return rows.map(mapToolErrorRow)
}

export async function fetchToolPayloadSizes(p: AppInsightsProvider, opts?: TopOpts): Promise<ToolPayloadRow[]> {
  const limit = opts?.limit ?? 5
  const q = `
    union dependencies, requests
    | where name startswith "execute_tool "
    | extend result_len = strlen(tostring(customDimensions["gen_ai.tool.call.result"]))
    | where isnotnull(result_len) and result_len > 0
    | summarize
        avg_chars = avg(result_len),
        p95_chars = percentile(result_len, 95),
        max_chars = max(result_len),
        count = count(),
        sample_trace_id = take_any(operation_Id)
      by name
    | top ${limit} by p95_chars desc
  `
  const rows = await p.query(q, opts ?? {})
  return rows.map(mapToolPayloadRow)
}

export async function fetchChatLatencyOverTime(p: AppInsightsProvider, opts?: WindowOpts): Promise<LatencyPoint[]> {
  const fromUs = opts?.fromUs ?? 0
  const toUs = opts?.toUs ?? 0
  const bucketSec = bucketSecondsFor(fromUs, toUs)
  const q = `
    union dependencies, requests
    | where tostring(customDimensions["gen_ai.operation.name"]) == "chat"
    | summarize p50_ms = percentile(duration, 50), p95_ms = percentile(duration, 95), count = count() by bucket = bin(timestamp, ${bucketSec}s)
    | order by bucket asc
  `
  const rows = await p.query(q, opts ?? {})
  return zeroFillSeries(rows, fromUs, toUs, bucketSec, (r) => ({
    p50Ms: Math.round(num(r.p50_ms) ?? 0),
    p95Ms: Math.round(num(r.p95_ms) ?? 0),
    count: Number(r.count ?? 0),
  })).map((b) => ({ ts: b.ts, p50Ms: b.value.p50Ms, p95Ms: b.value.p95Ms, count: b.value.count }))
}

export async function fetchCacheHitRateOverTime(p: AppInsightsProvider, opts?: WindowOpts): Promise<CacheHitPoint[]> {
  const fromUs = opts?.fromUs ?? 0
  const toUs = opts?.toUs ?? 0
  const bucketSec = bucketSecondsFor(fromUs, toUs)
  const cacheExpr = `toint(${aiCoalesce('cacheReadTokens')})`
  const inputExpr = `toint(${aiCoalesce('inputTokens')})`
  const q = `
    union dependencies, requests
    | where tostring(customDimensions["gen_ai.operation.name"]) == "chat"
    | extend cache_tok = ${cacheExpr}, input_tok = ${inputExpr}
    | summarize cache_tokens = sum(cache_tok), input_tokens = sum(input_tok) by bucket = bin(timestamp, ${bucketSec}s)
    | order by bucket asc
  `
  const rows = await p.query(q, opts ?? {})
  return zeroFillSeries(rows, fromUs, toUs, bucketSec, (r) => {
    const cache = num(r.cache_tokens) ?? 0
    const input = num(r.input_tokens) ?? 0
    return { ratio: input > 0 ? cache / input : 0, inputTokens: input }
  }).map((b) => ({ ts: b.ts, ratio: b.value.ratio, inputTokens: b.value.inputTokens }))
}

export async function fetchRunsPerHour(p: AppInsightsProvider, opts?: WindowOpts): Promise<RunsPoint[]> {
  const fromUs = opts?.fromUs ?? 0
  const toUs = opts?.toUs ?? 0
  const bucketSec = bucketSecondsFor(fromUs, toUs)
  const q = `
    union dependencies, requests
    | extend gen_op = tostring(customDimensions["gen_ai.operation.name"])
    | where isnotempty(gen_op) or name startswith "invoke_agent " or name startswith "execute_tool "
    | summarize runs = dcount(operation_Id) by bucket = bin(timestamp, ${bucketSec}s)
    | order by bucket asc
  `
  const rows = await p.query(q, opts ?? {})
  return zeroFillSeries(rows, fromUs, toUs, bucketSec, (r) => ({ runs: Number(r.runs ?? 0) })).map((b) => ({
    ts: b.ts,
    runs: b.value.runs,
  }))
}

export async function fetchInventory(
  p: AppInsightsProvider,
  kind: InventoryDiscoveryKind,
  opts?: WindowOpts,
): Promise<InventoryObservation[]> {
  const prefix = kind === 'new_tool' ? 'execute_tool' : 'invoke_agent'
  const q = `
    union dependencies, requests
    | where name startswith "${prefix} "
    | summarize
        first_seen = min(timestamp),
        last_seen  = max(timestamp),
        sample_trace_id = any(operation_Id)
      by operation_name = name
    | top 1000 by first_seen desc
  `
  const rows = await p.query(q, opts ?? {})
  return rows.map((r) => rowToInventoryObservation(kind, r)).filter((o): o is InventoryObservation => o !== null)
}

function rowToInventoryObservation(
  kind: InventoryDiscoveryKind,
  row: Record<string, unknown>,
): InventoryObservation | null {
  const operationName = String(row.operation_name ?? '')
  const name = kind === 'new_tool' ? extractToolName(operationName) : extractAgentName(operationName)
  if (!name) return null
  const firstSeen = typeof row.first_seen === 'string' ? Date.parse(row.first_seen) : 0
  const lastSeen = typeof row.last_seen === 'string' ? Date.parse(row.last_seen) : firstSeen
  return {
    kind: kind === 'new_tool' ? 'mcp_tool' : 'agent',
    name,
    namespace: '',
    firstSeenMs: firstSeen,
    lastSeenMs: lastSeen,
    traceId: typeof row.sample_trace_id === 'string' ? row.sample_trace_id : undefined,
  }
}

// KQL `summarize ... by bin(ts, ...)` returns a string (sometimes with a `+`
// offset) or a JS Date depending on the column type.
function parseBucketMs(raw: unknown): number | undefined {
  if (typeof raw === 'number') return raw < 1e12 ? raw * 1000 : raw
  if (typeof raw === 'string') {
    const ms = Date.parse(raw.endsWith('Z') || raw.includes('+') ? raw : `${raw}Z`)
    return Number.isFinite(ms) ? ms : undefined
  }
  if (raw instanceof Date) return raw.getTime()
  return undefined
}

function zeroFillSeries<V>(
  rows: Array<Record<string, unknown>>,
  fromUs: number,
  toUs: number,
  bucketSec: number,
  mapValue: (r: Record<string, unknown>) => V,
): Array<{ ts: number; value: V }> {
  return zeroFillBucketed(rows, fromUs, toUs, bucketSec, (r) => parseBucketMs(r.bucket), mapValue)
}
