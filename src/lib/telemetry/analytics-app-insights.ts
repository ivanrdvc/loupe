import { extractAgentName, extractToolName, parseSystemInstructions } from '#/lib/spans/classify-span'
import { aiCoalesce } from './conventions'
import { mapToolErrorRow, mapToolPayloadRow, num } from './shared'
import { bucketSecondsFor, zeroFillBucketedAt } from './time-series'
import type {
  AgentMetrics,
  AppInsightsProvider,
  CacheHitPoint,
  InventoryDiscoveryKind,
  InventoryObservation,
  LatencyPoint,
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
    | extend result_len = strlen(tostring(customDimensions["gen_ai.tool.call.result"])),
             sess = ${aiCoalesce('sessionId')}
    | where isnotnull(result_len) and result_len > 0
    | summarize
        avg_chars = avg(result_len),
        p95_chars = percentile(result_len, 95),
        max_chars = max(result_len),
        count = count(),
        sample_trace_id = take_any(operation_Id),
        sample_session_id = take_anyif(sess, isnotempty(sess))
      by name
    | top ${limit} by p95_chars desc
  `
  const rows = await p.query(q, opts ?? {})
  return rows.map(mapToolPayloadRow)
}

export async function fetchAllTools(p: AppInsightsProvider, opts?: TopOpts): Promise<ToolCatalogRow[]> {
  const limit = opts?.limit ?? 1000
  const q = `
    union dependencies, requests
    | where name startswith "execute_tool "
    | extend result_len = strlen(tostring(customDimensions["gen_ai.tool.call.result"]))
    | extend result_len_nz = iif(result_len > 0, todouble(result_len), real(null))
    | summarize
        calls = count(),
        errors = countif(success == false),
        avg_chars = avg(result_len_nz),
        p95_chars = percentile(result_len_nz, 95),
        p50_ms = percentile(duration, 50),
        p95_ms = percentile(duration, 95),
        last_seen = max(timestamp)
      by name
    | top ${limit} by calls desc
  `
  const rows = await p.query(q, opts ?? {})
  return rows.map((r) => {
    const calls = Number(r.calls ?? 0)
    const errors = Number(r.errors ?? 0)
    const raw = String(r.name ?? '')
    return {
      name: extractToolName(raw) ?? raw,
      calls,
      errors,
      errorRate: calls > 0 ? errors / calls : 0,
      avgChars: Math.round(num(r.avg_chars) ?? 0),
      p95Chars: Math.round(num(r.p95_chars) ?? 0),
      p50Ms: Math.round(num(r.p50_ms) ?? 0),
      p95Ms: Math.round(num(r.p95_ms) ?? 0),
      lastSeenMs: typeof r.last_seen === 'string' ? Date.parse(r.last_seen) : 0,
    }
  })
}

export async function fetchToolDetail(
  p: AppInsightsProvider,
  name: string,
  opts?: WindowOpts,
): Promise<ToolDetail | null> {
  if (!TOOL_NAME_RE.test(name)) return null
  const q = `
    union dependencies, requests
    | where name == "execute_tool ${name}"
    | extend result_len = strlen(tostring(customDimensions["gen_ai.tool.call.result"]))
    | extend result_len_nz = iif(result_len > 0, todouble(result_len), real(null))
    | summarize
        calls = count(),
        errors = countif(success == false),
        avg_chars = avg(result_len_nz),
        p95_chars = percentile(result_len_nz, 95),
        max_chars = max(result_len_nz),
        p50_ms = percentile(duration, 50),
        p95_ms = percentile(duration, 95),
        first_seen = min(timestamp),
        last_seen = max(timestamp)
  `
  const rows = await p.query(q, opts ?? {})
  const r = rows[0]
  const calls = Number(r?.calls ?? 0)
  if (!r || calls === 0) return null
  const errors = Number(r.errors ?? 0)
  return {
    name,
    calls,
    errors,
    errorRate: errors / calls,
    avgChars: Math.round(num(r.avg_chars) ?? 0),
    p95Chars: Math.round(num(r.p95_chars) ?? 0),
    maxChars: Math.round(num(r.max_chars) ?? 0),
    p50Ms: Math.round(num(r.p50_ms) ?? 0),
    p95Ms: Math.round(num(r.p95_ms) ?? 0),
    firstSeenMs: typeof r.first_seen === 'string' ? Date.parse(r.first_seen) : 0,
    lastSeenMs: typeof r.last_seen === 'string' ? Date.parse(r.last_seen) : 0,
  }
}

export async function fetchToolRecentCalls(
  p: AppInsightsProvider,
  name: string,
  opts?: WindowOpts & { limit?: number },
): Promise<ToolCallSample[]> {
  if (!TOOL_NAME_RE.test(name)) return []
  const limit = opts?.limit ?? 50
  const q = `
    union dependencies, requests
    | where name == "execute_tool ${name}"
    | extend sess = ${aiCoalesce('sessionId')}
    | order by timestamp desc
    | take ${limit}
    | project trace_id = operation_Id, session_id = sess, started_at = timestamp, duration_ms = duration, has_error = (success == false), result_chars = strlen(tostring(customDimensions["gen_ai.tool.call.result"]))
  `
  const rows = await p.query(q, opts ?? {})
  return rows
    .map((r) => {
      const traceId = typeof r.trace_id === 'string' ? r.trace_id : ''
      if (!traceId) return null
      const sessionId = typeof r.session_id === 'string' && r.session_id ? r.session_id : undefined
      const started = typeof r.started_at === 'string' ? Date.parse(r.started_at) : 0
      const sample: ToolCallSample = {
        traceId,
        startedAtMs: started,
        durationMs: Math.round(num(r.duration_ms) ?? 0),
        hasError: r.has_error === true || r.has_error === 'true',
      }
      const chars = num(r.result_chars)
      if (chars != null && chars > 0) sample.resultChars = Math.round(chars)
      if (sessionId) sample.sessionId = sessionId
      return sample
    })
    .filter((s): s is ToolCallSample => s !== null)
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
  return zeroFillBucketedAt(rows, fromUs, toUs, bucketSec, (r) => ({
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
  return zeroFillBucketedAt(rows, fromUs, toUs, bucketSec, (r) => {
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
  return zeroFillBucketedAt(rows, fromUs, toUs, bucketSec, (r) => ({ runs: Number(r.runs ?? 0) })).map((b) => ({
    ts: b.ts,
    runs: b.value.runs,
  }))
}

export async function fetchInventory(
  p: AppInsightsProvider,
  kind: InventoryDiscoveryKind,
  opts?: WindowOpts,
): Promise<InventoryObservation[]> {
  // ever_nested: agent invoked under execute_tool at least once (a utility agent
  // can run both nested and top-level, so join the parent span rather than guess
  // from the name). Parent side projected to id to bound the join.
  const q =
    kind === 'new_tool'
      ? `
    union dependencies, requests
    | where name startswith "execute_tool "
    | summarize
        first_seen = min(timestamp),
        last_seen  = max(timestamp),
        sample_trace_id = any(operation_Id)
      by operation_name = name
    | top 1000 by first_seen desc
  `
      : `
    let tool_parents = union dependencies, requests
      | where name startswith "execute_tool "
      | project parent_id = id, parent_is_tool = 1;
    union dependencies, requests
    | where name startswith "invoke_agent "
    | join kind=leftouter (tool_parents) on $left.operation_ParentId == $right.parent_id
    | summarize
        first_seen = min(timestamp),
        last_seen  = max(timestamp),
        sample_trace_id = any(operation_Id),
        description = take_anyif(tostring(customDimensions["gen_ai.agent.description"]), isnotempty(tostring(customDimensions["gen_ai.agent.description"]))),
        system_instructions = take_anyif(tostring(customDimensions["gen_ai.system_instructions"]), isnotempty(tostring(customDimensions["gen_ai.system_instructions"]))),
        ever_nested = max(iif(parent_is_tool == 1, 1, 0))
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
  const isTool = kind === 'new_tool'
  const name = isTool ? extractToolName(operationName) : extractAgentName(operationName)
  if (!name) return null
  const firstSeen = typeof row.first_seen === 'string' ? Date.parse(row.first_seen) : 0
  const lastSeen = typeof row.last_seen === 'string' ? Date.parse(row.last_seen) : firstSeen
  const systemPrompt = parseSystemInstructions(
    typeof row.system_instructions === 'string' ? row.system_instructions : undefined,
  )
  const description = typeof row.description === 'string' && row.description ? row.description : undefined
  return {
    kind: isTool ? 'mcp_tool' : 'agent',
    name,
    firstSeenMs: firstSeen,
    lastSeenMs: lastSeen,
    traceId: typeof row.sample_trace_id === 'string' ? row.sample_trace_id : undefined,
    ...(description ? { description } : {}),
    ...(systemPrompt ? { systemPrompt } : {}),
    ...(isTool ? {} : { nested: Number(row.ever_nested ?? 0) === 1 }),
  }
}

export async function fetchAgentMetrics(p: AppInsightsProvider, opts?: TopOpts): Promise<AgentMetrics[]> {
  const limit = opts?.limit ?? 1000
  const q = `
    union dependencies, requests
    | where name startswith "invoke_agent "
    | extend agent_name = tostring(customDimensions["gen_ai.agent.name"])
    | where isnotempty(agent_name)
    | summarize
        calls = count(),
        errors = countif(success == false),
        p50_ms = percentile(duration, 50),
        p95_ms = percentile(duration, 95)
      by agent_name
    | top ${limit} by calls desc
  `
  const rows = await p.query(q, opts ?? {})
  return rows.map((r) => {
    const calls = Number(r.calls ?? 0)
    const errors = Number(r.errors ?? 0)
    return {
      name: String(r.agent_name ?? ''),
      calls,
      errorRate: calls > 0 ? errors / calls : 0,
      p50Ms: Math.round(num(r.p50_ms) ?? 0),
      p95Ms: Math.round(num(r.p95_ms) ?? 0),
    }
  })
}
