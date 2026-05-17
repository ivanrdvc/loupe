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

export type TraceFetch = { spans: Span[]; truncated?: boolean } | null

export type GetTraceOpts = WindowOpts & IdentityFilter
export type ListTracesOpts = ListOpts

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
}

// A session is the spine of a multi-turn conversation per
// `docs/plans/sessions.md` — many runs share one sessionId. `source`
// discloses whether the id came from a real attribute or the agent-instance
// hex heuristic (used when no attribute is present).
export interface SessionSummary {
  sessionId: string
  title?: string
  userName?: string
  userId?: string
  host?: string
  source: 'attribute' | 'agent-instance'
  startedAtMs: number
  lastSeenMs: number
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

export type LatencyKind = 'generation' | 'observation'

export interface LatencyRow {
  name: string
  p50Ms: number
  p90Ms: number
  p95Ms: number
  p99Ms: number
  count: number
}

export type LatencyOpts = ListOpts

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

// 24-bucket time series for one tool, used to render an inline sparkline next
// to the aggregate row. Buckets are aligned to the user's selected window;
// missing buckets are zero-filled by the consumer.
export interface ToolBucketPoint {
  ts: number
  value: number
}

export interface ToolSpark {
  name: string
  buckets: ToolBucketPoint[]
}

export type TopOpts = ListOpts

export interface OverviewAggregate {
  runs: number
  erroredRuns: number
  p95ChatMs: number
  totalCostUsd: number
}

export type OverviewOpts = WindowOpts

export type SessionFetch = {
  sessionId: string
  source: 'attribute' | 'agent-instance'
  traceIds: string[]
  spans: Span[]
  title?: string
} | null

export interface TelemetryProvider {
  name: string
  fingerprint: string

  // 'found'     -> chain stops, spans returned
  // 'not_found' -> definitively no trace by this id; chain tries next provider
  // throws      -> real error (auth/network); chain logs and continues
  getTrace(traceId: string, opts?: GetTraceOpts): Promise<TraceFetch>

  // Aggregated summary of recent traces. Optional: a provider that only
  // supports point-lookups returns undefined here and the index page skips it.
  listTraces?(opts?: ListTracesOpts): Promise<TraceSummary[]>

  // Sessions: groups of runs sharing a sessionId (see SessionSummary).
  // Optional — providers without grouping capability omit these.
  // `truncated` = the underlying scan hit its row cap, so older sessions
  // may be missing from the result.
  listSessions?(opts?: ListSessionsOpts): Promise<{ sessions: SessionSummary[]; truncated: boolean }>
  getSession?(sessionId: string, opts?: GetTraceOpts): Promise<SessionFetch>
  discoverInventory?(kind: InventoryDiscoveryKind, opts?: GetTraceOpts): Promise<InventoryObservation[]>

  // Latency percentiles grouped by operation_name. `generation` filters to
  // LLM calls; `observation` is the full span set.
  listLatencyPercentiles?(kind: LatencyKind, opts?: LatencyOpts): Promise<LatencyRow[]>

  // Tools with high error rate — grouped by execute_tool operation_name.
  listToolErrorRates?(opts?: TopOpts): Promise<ToolErrorRow[]>

  // Tools returning too much — grouped by execute_tool operation_name,
  // percentiles over output payload char length.
  listToolPayloadSizes?(opts?: TopOpts): Promise<ToolPayloadRow[]>

  // Bucketed time series of errors-per-tool, for inline sparklines.
  listToolErrorRatesBucketed?(opts?: TopOpts): Promise<ToolSpark[]>

  // Bucketed time series of avg-output-size-per-tool, for inline sparklines.
  listToolPayloadSizesBucketed?(opts?: TopOpts): Promise<ToolSpark[]>

  // Single-shot KPIs for the home page hero. Single SQL/KQL when possible.
  getOverview?(opts?: OverviewOpts): Promise<OverviewAggregate>

  // getLogs?(filter, opts?): Promise<LogEntry[]>
  // getMetric?(name, range): Promise<MetricSeries>
}
