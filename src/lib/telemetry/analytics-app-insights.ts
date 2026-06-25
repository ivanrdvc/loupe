import { tokensFromChars } from '#/lib/format'
import { extractAgentName, extractToolName, parseSystemInstructions } from '#/lib/spans/classify-span'
import { countTokens } from '#/lib/tokens'
import { aiCoalesce } from './conventions'
import { mapToolErrorRow, num, toCount } from './shared'
import { bucketSecondsFor, zeroFillBucketedAt } from './time-series'
import type {
  AgentMetrics,
  AppInsightsProvider,
  CacheHitPoint,
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
  TopOpts,
  WindowOpts,
} from './types'

const TOOL_NAME_RE = /^[A-Za-z0-9_./:-]+$/
const SPAN_ID_RE = /^[A-Za-z0-9_-]+$/
const RESULT_ATTR = 'gen_ai.tool.call.result'
// App Insights caps a customDimensions value near here; a body at the cap is
// presumed truncated (the full value lives in a fork's store).
const APP_INSIGHTS_DIM_CAP = 8192

function kqlString(value: string): string {
  return `"${value.replaceAll('\\', '\\\\').replaceAll('"', '\\"')}"`
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

// The one execute_tool aggregate: `name` → single-row exact fetch, else the catalog.
export async function fetchTools(p: AppInsightsProvider, opts?: ToolListOpts): Promise<ToolRow[]> {
  const name = opts?.name
  if (name !== undefined && !TOOL_NAME_RE.test(name)) return []
  const limit = name !== undefined ? 1 : (opts?.limit ?? 1000)
  const nameFilter =
    name !== undefined
      ? `| where name == ${kqlString(`execute_tool ${name}`)}`
      : `| where name startswith "execute_tool "`
  const dimFilters = (opts?.dimensions ?? [])
    .map((d) => `| where ${aiCoalesce(d.field)} == ${kqlString(d.value)}`)
    .join('\n    ')
  const q = `
    union dependencies, requests
    ${nameFilter}
    ${dimFilters}
    | extend body = tostring(customDimensions["${RESULT_ATTR}"])
    | extend result_len = strlen(body)
    | extend result_len_nz = iif(result_len > 0, todouble(result_len), real(null))
    | extend sess = ${aiCoalesce('sessionId')}
    | summarize
        calls = count(),
        calls_with_result = countif(result_len > 0),
        errors = countif(success == false),
        avg_chars = avg(result_len_nz),
        p50_chars = percentile(result_len_nz, 50),
        p95_chars = percentile(result_len_nz, 95),
        max_chars = max(result_len_nz),
        max_body = arg_max(result_len, body),
        total_chars = sum(result_len),
        p50_ms = percentile(duration, 50),
        p95_ms = percentile(duration, 95),
        first_seen = min(timestamp),
        last_seen = max(timestamp),
        sample_trace_id = take_any(operation_Id),
        sample_session_id = take_anyif(sess, isnotempty(sess))
      by name
    | top ${limit} by calls desc
  `
  const rows = await p.query(q, opts ?? {})
  return rows.map((r) => {
    const calls = Number(r.calls ?? 0)
    const errors = Number(r.errors ?? 0)
    const raw = String(r.name ?? '')
    const sample = r.sample_trace_id
    const session = r.sample_session_id
    return {
      name: extractToolName(raw) ?? raw,
      calls,
      callsWithResult: Number(r.calls_with_result ?? 0),
      errors,
      errorRate: calls > 0 ? errors / calls : 0,
      avgTokensEst: tokensFromChars(toCount(r.avg_chars)),
      p50TokensEst: tokensFromChars(toCount(r.p50_chars)),
      p95TokensEst: tokensFromChars(toCount(r.p95_chars)),
      maxTokens:
        typeof r.max_body === 'string' && r.max_body.length > 0
          ? countTokens(r.max_body)
          : tokensFromChars(toCount(r.max_chars)),
      totalTokensEst: tokensFromChars(toCount(r.total_chars)),
      p50Ms: Math.round(num(r.p50_ms) ?? 0),
      p95Ms: Math.round(num(r.p95_ms) ?? 0),
      firstSeenMs: typeof r.first_seen === 'string' ? Date.parse(r.first_seen) : 0,
      lastSeenMs: typeof r.last_seen === 'string' ? Date.parse(r.last_seen) : 0,
      ...(typeof sample === 'string' && sample ? { sampleTraceId: sample } : {}),
      ...(typeof session === 'string' && session ? { sampleSessionId: session } : {}),
    }
  })
}

export async function fetchToolPayloadBody(p: AppInsightsProvider, spanId: string): Promise<RawPayloadBody | null> {
  if (!SPAN_ID_RE.test(spanId)) return null
  const q = `
    union dependencies, requests
    | where id == ${kqlString(spanId)}
    | project body = tostring(customDimensions["${RESULT_ATTR}"])
    | where isnotempty(body)
    | take 1
  `
  const rows = await p.query(q, {})
  const body = rows[0]?.body
  if (typeof body !== 'string') return null
  return { body, truncated: body.length >= APP_INSIGHTS_DIM_CAP }
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
    | where name == ${kqlString(`execute_tool ${name}`)}
    | extend sess = ${aiCoalesce('sessionId')}
    | order by timestamp desc
    | take ${limit}
    | project trace_id = operation_Id, span_id = id, session_id = sess, started_at = timestamp, duration_ms = duration, has_error = (success == false), result_body = tostring(customDimensions["${RESULT_ATTR}"])
  `
  const rows = await p.query(q, opts ?? {})
  return rows
    .map((r) => {
      const traceId = typeof r.trace_id === 'string' ? r.trace_id : ''
      if (!traceId) return null
      const sessionId = typeof r.session_id === 'string' && r.session_id ? r.session_id : undefined
      const spanId = typeof r.span_id === 'string' && r.span_id ? r.span_id : undefined
      const started = typeof r.started_at === 'string' ? Date.parse(r.started_at) : 0
      const sample: ToolCallSample = {
        traceId,
        startedAtMs: started,
        durationMs: Math.round(num(r.duration_ms) ?? 0),
        hasError: r.has_error === true || r.has_error === 'true',
      }
      // Body may be truncated by the App Insights 8KB customDimensions cap, so
      // the token count reflects the stored body, not necessarily the full result.
      const body = typeof r.result_body === 'string' ? r.result_body : ''
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
  p: AppInsightsProvider,
  name: string,
  opts?: WindowOpts,
): Promise<ToolPayloadPoint[]> {
  if (!TOOL_NAME_RE.test(name)) return []
  const fromUs = opts?.fromUs ?? 0
  const toUs = opts?.toUs ?? 0
  const bucketSec = bucketSecondsFor(fromUs, toUs)
  const q = `
    union dependencies, requests
    | where name == ${kqlString(`execute_tool ${name}`)}
    | extend result_len = strlen(tostring(customDimensions["${RESULT_ATTR}"]))
    | extend result_len_nz = iif(result_len > 0, todouble(result_len), real(null))
    | summarize p95_chars = percentile(result_len_nz, 95), count = count() by bucket = bin(timestamp, ${bucketSec}s)
    | order by bucket asc
  `
  const rows = await p.query(q, opts ?? {})
  return zeroFillBucketedAt(rows, fromUs, toUs, bucketSec, (r) => ({
    p95TokensEst: tokensFromChars(toCount(r.p95_chars)),
    calls: Number(r.count ?? 0),
  })).map((b) => ({ ts: b.ts, p95TokensEst: b.value.p95TokensEst, calls: b.value.calls }))
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
