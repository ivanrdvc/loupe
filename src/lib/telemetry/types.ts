import type { Span } from '#/lib/spans'

export interface WindowOpts {
  fromUs?: number
  toUs?: number
}

export interface IdentityFilter {
  userId?: string
  userName?: string
}

export interface ListOpts extends WindowOpts {
  limit?: number
}

export type TraceFetch = { spans: Span[]; truncated?: boolean; focusSpanId?: string } | null

export type GetTraceOpts = WindowOpts & IdentityFilter
export type ListTracesOpts = ListOpts & IdentityFilter

export type TraceCategory = 'chat' | 'sub-agent' | 'scheduled' | 'webhook' | 'background' | 'utility' | 'orphan'

export interface TraceSummary {
  id: string
  startedAtMs: number
  durationMs: number
  spanCount: number
  agent?: string
  // Lifted from span attrs — the user-emitted run context that lets the trace
  // list show what a run *is*, not just "which agent name appeared first".
  serviceName?: string // OTel `service.name` — the app that emitted the run
  sessionId?: string // AG-UI `ag_ui_thread_id` (and later: `session.id`, `langfuse.trace.session.id`)
  totalTokens?: number
  totalCostUsd?: number
  hasError?: boolean
  category?: TraceCategory
  // Raw producer attributes, kept so the UI can show a secondary chip
  // (e.g. llm_purpose=title_generation under category=utility).
  triggerType?: string
  execution?: string
  llmPurpose?: string
  hasSessionAttribute?: boolean
  // Root operation name (first non-http span or fallback to first span name).
  rootOperation?: string
  // User identity if present on the trace (lifted from user.id / user.name attrs).
  userId?: string
  userName?: string
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

export interface OverviewAggregate {
  runs: number
  erroredRuns: number
  p95ChatMs: number
  totalCostUsd: number
}

export type OverviewOpts = WindowOpts

export type SessionFetch = {
  sessionId: string
  source: 'attribute' | 'trace'
  traceIds: string[]
  spans: Span[]
  title?: string
} | null

// Span-shape methods stay on the provider — each one's row format is bespoke
// and intertwined with span normalization. Pure-aggregation features (overview,
// latency, tool stats, inventory) live in features.ts and dispatch on `name`;
// the queries are provider-specific (DataFusion-on-OO-schema vs KQL-on-AI-schema),
// not a shared dialect.
interface BaseProvider {
  fingerprint: string
  getTrace(traceId: string, opts?: GetTraceOpts): Promise<TraceFetch>
  listTraces?(opts?: ListTracesOpts): Promise<TraceSummary[]>
  listSessions?(opts?: ListSessionsOpts): Promise<{ sessions: SessionSummary[]; truncated: boolean }>
  getSession?(sessionId: string, opts?: GetTraceOpts): Promise<SessionFetch>
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

export type TelemetryProvider = OpenObserveProvider | AppInsightsProvider
