import { extractAgentName } from '#/lib/spans/classify-span'
import { type CanonicalField, IDENTITY_FILTERS } from './conventions'
import { classifyTraceCategory } from './trace-category'
import type { IdentityFilter, SpansViewKind, ToolErrorRow, TraceSummary } from './types'

// Hard cap on spans returned for one trace fetch. A trace exceeding this is
// truncated and rendered partially.
export const TRACE_FETCH_LIMIT = 5000
// Default row cap for list queries (sessions/traces/spans) when no limit given.
export const DEFAULT_LIST_LIMIT = 50
// Bound stalled provider scans (else an infinite spinner with no error).
export const PROVIDER_QUERY_TIMEOUT_MS = 120_000

// Validate identifiers interpolated into provider queries.
export const SPAN_ID_RE = /^[A-Za-z0-9_-]+$/
export const TOOL_NAME_RE = /^[A-Za-z0-9_./:-]+$/

// Spans-tab classifier. Backends return rows matched by either a non-null
// purpose attr (utility) or `invoke_agent` nested under `execute_tool`
// (sub-agent). Two providers feed the same UI, so the row → display fields
// mapping lives here.
export function classifySpanRow(
  spanName: string,
  purpose: string,
  agentName?: string,
): { kind: SpansViewKind; label: string } {
  if (purpose) return { kind: 'utility', label: purpose }
  return { kind: 'sub-agent', label: agentName || extractAgentName(spanName) || spanName }
}

export function pickIdentityValue(
  opts: IdentityFilter | undefined,
): { kind: 'id' | 'name'; value: string } | undefined {
  if (opts?.userId) return { kind: 'id', value: opts.userId }
  if (opts?.userName) return { kind: 'name', value: opts.userName }
  return undefined
}

export function identityFields(opts: IdentityFilter | undefined): { field: CanonicalField; value: string }[] {
  const fields: { field: CanonicalField; value: string }[] = []
  const user = pickIdentityValue(opts)
  if (user) fields.push({ field: user.kind === 'id' ? 'userId' : 'userName', value: user.value })
  for (const dim of IDENTITY_FILTERS) {
    const value = opts?.[dim.key]
    if (typeof value === 'string' && value) fields.push({ field: dim.field, value })
  }
  return fields
}

export function mapToolErrorRow(row: Record<string, unknown>): ToolErrorRow {
  const errors = Number(row.errors ?? 0)
  const total = Number(row.total ?? 0)
  const last = row.last_error_trace_id
  return {
    name: String(row.name ?? '?'),
    errors,
    total,
    errorRate: total > 0 ? errors / total : 0,
    lastErrorTraceId: typeof last === 'string' && last ? last : undefined,
  }
}

// Single-quote a value for inline SQL (DataFusion has no backslash escapes).
export function sqlString(value: string): string {
  return `'${value.replaceAll("'", "''")}'`
}

// Rounds a length aggregate to a non-negative count.
export function toCount(v: unknown): number {
  const n = Math.round(Number(v ?? 0))
  return Number.isFinite(n) && n > 0 ? n : 0
}

export function num(v: unknown): number | undefined {
  if (v === null || v === undefined || v === '') return undefined
  const n = Number(v)
  return Number.isFinite(n) ? n : undefined
}

// Single-value string picker — returns the value if it is a non-empty string,
// otherwise undefined. The multi-key variant is `pickString` above.
function pickStringValue(v: unknown): string | undefined {
  return typeof v === 'string' && v ? v : undefined
}

export function firstString(h: Record<string, unknown>, keys: readonly string[]): string | undefined {
  for (const k of keys) {
    const v = h[k]
    if (typeof v === 'string' && v.length > 0) return v
  }
  return undefined
}

// Both providers see `error.type` carrying either an HTTP status code or an
// exception class. HTTP codes render as `errorMessage = "HTTP 401"`; exception
// classes render as `errorType`. A separate http-status candidate is the final
// fallback when the message is otherwise empty.
export function classifyError(opts: {
  failed: boolean
  errorType?: string
  errorMessage?: string
  httpStatus?: string
}): { errorType?: string; errorMessage?: string } {
  let errorType: string | undefined
  let errorMessage: string | undefined
  if (opts.errorType) {
    if (/^[1-5]\d{2}$/.test(opts.errorType)) errorMessage = `HTTP ${opts.errorType}`
    else errorType = opts.errorType
  }
  if (!errorMessage && opts.errorMessage) errorMessage = opts.errorMessage
  if (!errorMessage && opts.failed && opts.httpStatus && /^[1-5]\d{2}$/.test(opts.httpStatus)) {
    errorMessage = `HTTP ${opts.httpStatus}`
  }
  return { errorType, errorMessage }
}

// Builds the TraceSummary from a grouped-by-trace row. Both providers alias
// their SQL columns to the same names (session_id, has_invoke_agent, root_*,
// trace_user_*, ...) so this helper takes only the values that need
// per-provider derivation (timing, error, agent, cost).
export function buildTraceSummary(
  row: Record<string, unknown>,
  derived: {
    id: string
    startedAtMs: number
    durationMs: number
    hasError: boolean
    agent?: string
    totalCostUsd?: number
  },
): TraceSummary {
  const hasSession = typeof row.session_id === 'string' && row.session_id.length > 0
  const rootLlmPurpose = pickStringValue(row.root_llm_purpose)
  const summary: TraceSummary = {
    id: derived.id,
    startedAtMs: derived.startedAtMs,
    durationMs: derived.durationMs,
    spanCount: Number(row.span_count ?? 0),
    hasError: derived.hasError,
    category: classifyTraceCategory({
      hasSessionAttribute: hasSession,
      hasInvokeAgent: Number(row.has_invoke_agent ?? 0) > 0,
      hasChat: Number(row.has_chat ?? 0) > 0,
      rootOperation: pickStringValue(row.root_operation),
      rootTriggerType: pickStringValue(row.root_trigger_type),
      rootExecution: pickStringValue(row.root_execution),
      rootLlmPurpose,
    }),
  }
  const tokens = num(row.total_tokens)
  if (tokens) summary.totalTokens = tokens
  if (derived.totalCostUsd && derived.totalCostUsd > 0) summary.totalCostUsd = derived.totalCostUsd
  if (derived.agent) summary.agent = derived.agent
  if (hasSession) summary.sessionId = String(row.session_id)
  if (rootLlmPurpose) summary.llmPurpose = rootLlmPurpose
  summary.serviceName = pickStringValue(row.service_name)
  summary.rootOperation = pickStringValue(row.root_operation)
  summary.userId = pickStringValue(row.trace_user_id)
  summary.userName = pickStringValue(row.trace_user_name)
  summary.taskId = pickStringValue(row.root_task_id)
  summary.taskKind = pickStringValue(row.root_task_kind)
  summary.taskSchedule = pickStringValue(row.root_task_schedule)
  summary.taskName = pickStringValue(row.root_task_name)
  summary.taskSource = pickStringValue(row.root_task_source)
  return summary
}

export function buildLogRecord(args: {
  timestampMs: number
  level: import('./types').LogLevel
  message: string
  source?: string
  traceId?: string
  spanId?: string
  attributes?: Record<string, unknown>
}): import('./types').LogRecord {
  const record: import('./types').LogRecord = {
    id: `${args.traceId ?? ''}-${args.spanId ?? ''}-${args.timestampMs}`,
    timestampMs: args.timestampMs,
    level: args.level,
    message: args.message,
  }
  if (args.attributes) {
    try {
      record.attributes = JSON.parse(JSON.stringify(args.attributes))
    } catch {
      // skip if anything in the row resists JSON
    }
  }
  if (args.source) record.source = args.source
  if (args.traceId) record.traceId = args.traceId
  if (args.spanId) record.spanId = args.spanId
  return record
}

export function groupBy<T, K>(items: readonly T[], key: (item: T) => K): Map<K, T[]> {
  const out = new Map<K, T[]>()
  for (const item of items) {
    const k = key(item)
    const arr = out.get(k)
    if (arr) arr.push(item)
    else out.set(k, [item])
  }
  return out
}
