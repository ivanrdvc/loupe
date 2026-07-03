import type { Span } from '#/lib/spans'
import { countTokens } from '#/lib/tokens'
import * as analytics from './analytics'
import { createClickHouseProvider } from './clickhouse'
import { createFixturesProvider } from './fixtures'
import type {
  AgentMetrics,
  CacheHitPoint,
  GetTraceOpts,
  InventoryDiscoveryKind,
  InventoryObservation,
  LatencyPoint,
  ListLogsOpts,
  ListSessionsOpts,
  ListSpansOpts,
  ListTaskRollupOpts,
  ListTracesOpts,
  LogRecord,
  RunsPoint,
  SessionSummary,
  SpanSummary,
  TaskRollupRow,
  TelemetryProvider,
  ToolCallSample,
  ToolErrorRow,
  ToolListOpts,
  ToolPayloadBody,
  ToolPayloadPoint,
  ToolRow,
  TopOpts,
  TraceSummary,
  WindowOpts,
} from './types'

export type * from './types'

const PROVIDER_IDS = ['clickhouse', 'fixtures'] as const
export type ProviderId = (typeof PROVIDER_IDS)[number]

const providers = new Map<ProviderId, TelemetryProvider>()

function buildProvider(id: ProviderId): TelemetryProvider {
  if (id === 'fixtures') return createFixturesProvider()
  return createClickHouseProvider({
    url: process.env.CLICKHOUSE_URL ?? 'http://localhost:8123',
    database: process.env.CLICKHOUSE_DB ?? 'loupe',
    username: process.env.CLICKHOUSE_USER ?? 'loupe',
    password: process.env.CLICKHOUSE_PASS ?? 'loupe',
  })
}

function getProvider(id: ProviderId): TelemetryProvider {
  let p = providers.get(id)
  if (!p) {
    p = buildProvider(id)
    providers.set(id, p)
  }
  return p
}

// ClickHouse is the only live backend; Fixtures is the e2e double, selected only
// via TELEMETRY_PROVIDER=fixtures.
function resolveProviderId(): ProviderId {
  return process.env.TELEMETRY_PROVIDER === 'fixtures' ? 'fixtures' : 'clickhouse'
}

function getActiveProvider(): TelemetryProvider {
  return getProvider(resolveProviderId())
}

export function getActiveProviderId(): ProviderId {
  return resolveProviderId()
}

export async function getTrace(traceId: string): Promise<{
  spans: Span[]
  truncated: boolean
  provider: string
  fingerprint: string
  focusSpanId?: string
} | null> {
  const p = getActiveProvider()
  const r = await p.getTrace(traceId)
  if (!r) return null
  return {
    spans: r.spans,
    truncated: !!r.truncated,
    provider: p.name,
    fingerprint: p.fingerprint,
    focusSpanId: r.focusSpanId,
  }
}

export async function listRecentTraces(opts?: ListTracesOpts): Promise<{
  traces: TraceSummary[]
  hasMore: boolean
  provider: string
  fingerprint: string
} | null> {
  const p = getActiveProvider()
  if (!p.listTraces) return null
  const r = await p.listTraces(opts)
  return { traces: r.traces, hasMore: r.hasMore, provider: p.name, fingerprint: p.fingerprint }
}

export async function listRecentSpans(opts?: ListSpansOpts): Promise<{
  spans: SpanSummary[]
  hasMore: boolean
  provider: string
  fingerprint: string
} | null> {
  const p = getActiveProvider()
  if (!p.listSpans) return null
  const r = await p.listSpans(opts)
  return { spans: r.spans, hasMore: r.hasMore, provider: p.name, fingerprint: p.fingerprint }
}

export async function listRecentSessions(opts?: ListSessionsOpts): Promise<{
  sessions: SessionSummary[]
  truncated: boolean
  hasMore: boolean
  provider: string
  fingerprint: string
} | null> {
  const p = getActiveProvider()
  if (!p.listSessions) return null
  const r = await p.listSessions(opts)
  return {
    sessions: r.sessions,
    truncated: r.truncated,
    hasMore: r.hasMore,
    provider: p.name,
    fingerprint: p.fingerprint,
  }
}

export async function listTaskRollup(opts?: ListTaskRollupOpts): Promise<{
  rows: TaskRollupRow[]
  provider: string
  fingerprint: string
} | null> {
  const p = getActiveProvider()
  if (!p.listTaskRollup) return null
  return { rows: await p.listTaskRollup(opts), provider: p.name, fingerprint: p.fingerprint }
}

export async function getSession(
  sessionId: string,
  opts?: GetTraceOpts,
): Promise<{
  sessionId: string
  source: 'attribute' | 'trace'
  spans: Span[]
  traceIds: string[]
  provider: string
  fingerprint: string
  title?: string
} | null> {
  const p = getActiveProvider()
  if (!p.getSession) return null
  const r = await p.getSession(sessionId, opts)
  if (!r) return null
  return { ...r, provider: p.name, fingerprint: p.fingerprint }
}

export async function listSessionLogs(opts: ListLogsOpts): Promise<{
  logs: LogRecord[]
  provider: string
  fingerprint: string
} | null> {
  const p = getActiveProvider()
  if (!p.listLogs) return null
  return { logs: await p.listLogs(opts), provider: p.name, fingerprint: p.fingerprint }
}

export async function discoverInventory(
  kind: InventoryDiscoveryKind,
  opts?: { fromUs?: number; toUs?: number },
): Promise<InventoryObservation[]> {
  return analytics.fetchInventory(getActiveProvider(), kind, opts)
}

export async function listAgentMetrics(opts?: TopOpts): Promise<AgentMetrics[]> {
  return analytics.fetchAgentMetrics(getActiveProvider(), opts)
}

export async function listToolErrorRates(opts?: TopOpts): Promise<ToolErrorRow[]> {
  return analytics.fetchToolErrorRates(getActiveProvider(), opts)
}

export async function listTools(opts?: ToolListOpts): Promise<ToolRow[]> {
  return analytics.fetchTools(getActiveProvider(), opts)
}

export async function getToolPayloadBody(spanId: string): Promise<ToolPayloadBody | null> {
  const raw = await analytics.fetchToolPayloadBody(getActiveProvider(), spanId)
  if (!raw) return null
  return { ...raw, tokens: countTokens(raw.body) }
}

export async function listToolRecentCalls(
  name: string,
  opts?: WindowOpts & { limit?: number },
): Promise<ToolCallSample[]> {
  return analytics.fetchToolRecentCalls(getActiveProvider(), name, opts)
}

export async function listToolPayloadOverTime(name: string, opts?: WindowOpts): Promise<ToolPayloadPoint[]> {
  return analytics.fetchToolPayloadOverTime(getActiveProvider(), name, opts)
}

export async function listChatLatencyOverTime(opts?: WindowOpts): Promise<LatencyPoint[]> {
  return analytics.fetchChatLatencyOverTime(getActiveProvider(), opts)
}

export async function listCacheHitRateOverTime(opts?: WindowOpts): Promise<CacheHitPoint[]> {
  return analytics.fetchCacheHitRateOverTime(getActiveProvider(), opts)
}

export async function listRunsPerHour(opts?: WindowOpts): Promise<RunsPoint[]> {
  return analytics.fetchRunsPerHour(getActiveProvider(), opts)
}
