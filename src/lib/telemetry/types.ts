import type { Span } from '#/lib/spans'
import type { CanonicalField } from './conventions'

export interface WindowOpts {
  fromUs?: number
  toUs?: number
}

export interface IdentityFilter {
  userId?: string
  userName?: string
  host?: string
}

interface ListOpts extends WindowOpts {
  limit?: number
  offset?: number
  status?: 'error' | 'ok'
  /** Free-text; ILIKE substring match on the list's identifying columns. */
  search?: string
  // Numeric floors (server-side WHERE) — used by the read-only query API.
  minCostUsd?: number
  minTokens?: number
  minDurationMs?: number
}

// Substring (ILIKE) filters for the read-only query API (/api/search). Distinct
// from the exact identity/facet filters the dashboard uses (agentName is a
// prefix match; userId/userName are exact).
export interface TextMatchFilter {
  agentContains?: string
  userContains?: string
  sessionContains?: string
  modelContains?: string
}

export type TriggerType = 'scheduled' | 'event' | 'webhook' | 'user'

// Applied before the query's LIMIT so a rare subset isn't crowded out. agentName is a prefix match.
export interface TraceFilter {
  triggerTypes?: readonly TriggerType[]
  serviceName?: string
  agentName?: string
  // Exact derived-category match (mirrors classifyTraceCategory in SQL).
  category?: TraceCategory
  // Encoded task identity (see features/tasks taskIdentity): task:<id> | op:<root> | derived:<svc|agent|cat>.
  taskKey?: string
}

// Spans-tab facet.
export interface SpanFilter {
  kind?: SpansViewKind
}

export type TraceFetch = { spans: Span[]; truncated?: boolean; focusSpanId?: string } | null

export type GetTraceOpts = WindowOpts & IdentityFilter
export type ListTracesOpts = ListOpts & IdentityFilter & TraceFilter & TextMatchFilter
export type ListSpansOpts = ListOpts & IdentityFilter & SpanFilter & TextMatchFilter

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

// A session is the spine of a multi-turn conversation (see
// `docs/explanation/sessions-vs-live.md`) — many runs share one sessionId. `source`
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
  firstSeenMs: number
  lastSeenMs: number
  traceId?: string
  description?: string
  systemPrompt?: string
  nested?: boolean
}

export interface AgentMetrics {
  name: string
  model?: string
  calls: number
  errorRate: number
  p50Ms: number
  p95Ms: number
}

export interface ToolErrorRow {
  name: string
  errors: number
  total: number
  errorRate: number
  lastErrorTraceId?: string
}

// One execute_tool aggregate over a window.
export interface ToolRow {
  name: string // extracted, never the raw "execute_tool …"
  calls: number
  callsWithResult: number // denominator for the size stats (non-empty results)
  errors: number
  errorRate: number
  // chars÷4 estimates. maxTokens is exact only when maxTokensEst is false.
  avgTokensEst: number
  p50TokensEst: number
  p95TokensEst: number
  maxTokens: number
  maxTokensEst?: boolean
  totalTokensEst: number
  p50Ms: number
  p95Ms: number
  firstSeenMs: number
  lastSeenMs: number
  sampleTraceId?: string
  sampleSessionId?: string
}

// `field` resolves through the conventions allow-list; forks add company id there.
export interface ToolDimensionFilter {
  field: CanonicalField
  value: string
}

// ToolRow fields the catalog can be ordered by, server-side. avgTokensEst /
// p95TokensEst / totalTokensEst / maxTokens sort on their char proxy (monotonic
// with the token estimate); the rest map to a plain aggregate.
export type ToolSortColumn =
  | 'name'
  | 'calls'
  | 'errorRate'
  | 'p95Ms'
  | 'avgTokensEst'
  | 'p95TokensEst'
  | 'maxTokens'
  | 'totalTokensEst'
  | 'lastSeenMs'

export interface ToolListOpts extends ListOpts {
  name?: string // exact tool name → single-row fetch
  dimensions?: readonly ToolDimensionFilter[]
  sortBy?: ToolSortColumn
  sortDir?: 'asc' | 'desc'
}

// One task-identity group (see features/tasks taskIdentity/rollupTasks). The
// provider does the GROUP BY + aggregation in SQL; the tasks slice maps these to
// TaskRow (spark buckets, kind, declared overlay). fireTimestampsMs feeds the
// sparkline; identitySource is derivable from the key prefix.
export interface TaskRollupRow {
  key: string
  taskId?: string
  taskName?: string
  taskKind?: string
  taskSchedule?: string
  taskSource?: string
  rootOperation?: string
  category: TraceCategory
  agent?: string
  serviceName?: string
  fires: number
  errored: number
  avgDurationMs: number
  lastFireMs: number
  costUsd?: number
  conversationId?: string
  sampleTraceId: string
  fireTimestampsMs: number[]
}

export type ListTaskRollupOpts = WindowOpts & IdentityFilter

export interface ToolCallSample {
  traceId: string
  spanId?: string
  sessionId?: string
  startedAtMs: number
  durationMs: number
  hasError: boolean
  resultChars?: number
  // Real o200k count of the result body; absent when no body was stored.
  resultTokens?: number
}

// `truncated` when the provider capped the stored body (App Insights caps
// customDimensions); forks override the provider impl to read a complete store.
export interface ToolPayloadBody {
  body: string
  tokens: number
  truncated: boolean
}

// Provider yield; the dispatch wrapper adds the exact token count.
export type RawPayloadBody = Pick<ToolPayloadBody, 'body' | 'truncated'>

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

export interface ToolPayloadPoint {
  ts: number
  p95TokensEst: number // chars÷4 estimate; see ToolRow
  calls: number
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
  getTrace(traceId: string): Promise<TraceFetch>
  listTraces?(opts?: ListTracesOpts): Promise<{ traces: TraceSummary[]; hasMore: boolean }>
  listSpans?(opts?: ListSpansOpts): Promise<{ spans: SpanSummary[]; hasMore: boolean }>
  listSessions?(opts?: ListSessionsOpts): Promise<{ sessions: SessionSummary[]; truncated: boolean; hasMore: boolean }>
  listTaskRollup?(opts?: ListTaskRollupOpts): Promise<TaskRollupRow[]>
  getSession?(sessionId: string, opts?: GetTraceOpts): Promise<SessionFetch>
  listLogs?(opts: ListLogsOpts): Promise<LogRecord[]>
  query(q: string, opts: WindowOpts & { size?: number }): Promise<Array<Record<string, unknown>>>
}

export interface ClickHouseProvider extends BaseProvider {
  name: 'clickhouse'
  table: string
  logsTable: string
}

// In-memory provider for the e2e suite (see fixtures.ts). Not configured in
// production; settings shows it read-only when TELEMETRY_PROVIDER=fixtures.
export interface FixturesProvider extends BaseProvider {
  name: 'fixtures'
}

export type TelemetryProvider = ClickHouseProvider | FixturesProvider
