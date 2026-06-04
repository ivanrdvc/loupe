import type { Span } from '#/lib/spans'

export interface WindowOpts {
  fromUs?: number
  toUs?: number
}

export interface IdentityFilter {
  userId?: string
  userName?: string
}

interface ListOpts extends WindowOpts {
  limit?: number
}

export type TraceFetch = { spans: Span[]; truncated?: boolean; focusSpanId?: string } | null

export type GetTraceOpts = WindowOpts & IdentityFilter
export type ListTracesOpts = ListOpts & IdentityFilter
export type ListSpansOpts = ListOpts & IdentityFilter

export type SpansViewKind = 'utility' | 'sub-agent'

export interface SpanSummary {
  spanId: string
  traceId: string
  spanName: string
  kind: SpansViewKind
  label: string // purpose name for utility, agent base-name for sub-agent
  startedAtMs: number
  durationMs: number
  totalTokens?: number
  totalCostUsd?: number
  modelId?: string
  hasError?: boolean
  userId?: string
  userName?: string
}

export type TraceCategory =
  | 'chat'
  | 'sub-agent'
  | 'scheduled'
  | 'event'
  | 'webhook'
  | 'background'
  | 'utility'
  | 'orphan'

export interface TraceSummary {
  id: string
  startedAtMs: number
  durationMs: number
  spanCount: number
  agent?: string
  // Lifted from span attrs — the user-emitted run context that lets the trace
  // list show what a run *is*, not just "which agent name appeared first".
  serviceName?: string // OTel `service.name` — the app that emitted the run
  sessionId?: string // session attribute (e.g. `ag_ui.thread_id`, `session.id`, `gen_ai.conversation.id`)
  totalTokens?: number
  totalCostUsd?: number
  hasError?: boolean
  category?: TraceCategory
  // Shown as a secondary chip when category=utility (e.g. "title_generation").
  llmPurpose?: string
  // Root operation name (first non-http span or fallback to first span name).
  rootOperation?: string
  // User identity if present on the trace (lifted from user.id / user.name attrs).
  userId?: string
  userName?: string
  // task.* family lifted from the root span. Primary key for the Tasks page
  // rollup; without taskId every fire is its own row.
  taskId?: string
  taskKind?: string
  taskSchedule?: string
  taskName?: string
  taskSource?: string
}

// A session is the spine of a multi-turn conversation per
// `docs/plans/sessions.md` — many runs share one sessionId. `source`
// discloses whether the id came from a real attribute (`attribute`) or
// is just the trace id (`trace`), which means the data has no multi-turn
// linkage and one trace == one session.
export interface SessionSummary {
  sessionId: string
  title?: string
  userName?: string
  userId?: string
  host?: string
  source: 'attribute' | 'trace'
  startedAtMs: number
  lastSeenMs: number
  /** Sum of per-trace durations (actual compute time, not wall-clock gap between first and last span). */
  activeDurationMs: number
  traceCount: number
  agents: string[]
  firstInput?: string
  totalTokens?: number
  totalCostUsd?: number
  hasError?: boolean
}

export type ListSessionsOpts = ListOpts & IdentityFilter

export type InventoryDiscoveryKind = 'new_tool' | 'new_agent'

export interface InventoryObservation {
  kind: 'mcp_tool' | 'agent'
  name: string
  namespace: string
  firstSeenMs: number
  lastSeenMs: number
  traceId?: string
}

export interface ToolErrorRow {
  name: string
  errors: number
  total: number
  errorRate: number
  lastErrorTraceId?: string
}

export interface ToolPayloadRow {
  name: string
  avgChars: number
  p95Chars: number
  maxChars: number
  count: number
  sampleTraceId?: string
  sampleSessionId?: string
}

export interface ToolCatalogRow {
  name: string
  calls: number
  errors: number
  errorRate: number
  avgChars: number
  p95Chars: number
  p50Ms: number
  p95Ms: number
  lastSeenMs: number
}

export interface ToolDetail {
  name: string
  calls: number
  errors: number
  errorRate: number
  avgChars: number
  p95Chars: number
  maxChars: number
  p50Ms: number
  p95Ms: number
  firstSeenMs: number
  lastSeenMs: number
}

export interface ToolCallSample {
  traceId: string
  sessionId?: string
  startedAtMs: number
  durationMs: number
  hasError: boolean
}

export type TopOpts = ListOpts

export interface LatencyPoint {
  ts: number
  p50Ms: number
  p95Ms: number
  count: number
}

export interface CacheHitPoint {
  ts: number
  ratio: number
  inputTokens: number
}

export interface RunsPoint {
  ts: number
  runs: number
}

export type SessionFetch = {
  sessionId: string
  source: 'attribute' | 'trace'
  traceIds: string[]
  spans: Span[]
  title?: string
} | null

export type LogLevel = 'trace' | 'debug' | 'info' | 'warn' | 'error' | 'fatal'

// One application log record correlated to a trace. Time is in ms.
// `source` is the producer namespace (logger name / cloud_RoleName / etc).
// `attributes` carries everything else the row had so the UI can expand it.
export interface LogRecord {
  id: string
  timestampMs: number
  level: LogLevel
  message: string
  source?: string
  traceId?: string
  spanId?: string
  attributes?: Record<string, import('#/lib/json').JsonValue>
}

export interface ListLogsOpts extends WindowOpts {
  traceIds: string[]
  limit?: number
}

// Span-shape methods stay on the provider — each one's row format is bespoke
// and intertwined with span normalization. Pure-aggregation features (overview,
// latency, tool stats, inventory) live in features.ts and dispatch on `name`;
// the queries are provider-specific (DataFusion-on-OO-schema vs KQL-on-AI-schema),
// not a shared dialect.
interface BaseProvider {
  fingerprint: string
  getTrace(traceId: string, opts?: GetTraceOpts): Promise<TraceFetch>
  listTraces?(opts?: ListTracesOpts): Promise<TraceSummary[]>
  listSpans?(opts?: ListSpansOpts): Promise<SpanSummary[]>
  listSessions?(opts?: ListSessionsOpts): Promise<{ sessions: SessionSummary[]; truncated: boolean }>
  getSession?(sessionId: string, opts?: GetTraceOpts): Promise<SessionFetch>
  listLogs?(opts: ListLogsOpts): Promise<LogRecord[]>
  query(q: string, opts: WindowOpts & { size?: number }): Promise<Array<Record<string, unknown>>>
}

export interface OpenObserveProvider extends BaseProvider {
  name: 'openobserve'
  stream: string
  getKnownColumns(): Promise<ReadonlySet<string>>
}

export interface AppInsightsProvider extends BaseProvider {
  name: 'app-insights'
}

// In-memory provider for the e2e suite (see fixtures.ts). Not configured in
// production — only selectable when TELEMETRY_PROVIDER=fixtures.
export interface FixturesProvider extends BaseProvider {
  name: 'fixtures'
}

export type TelemetryProvider = OpenObserveProvider | AppInsightsProvider | FixturesProvider
