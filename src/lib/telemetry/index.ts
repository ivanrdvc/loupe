import { getCookie } from '@tanstack/react-start/server'
import type { Span } from '#/lib/spans'
import * as analytics from './analytics'
import { createAppInsightsProvider } from './app-insights'
import { createOpenObserveProvider } from './openobserve'
import type {
  CacheHitPoint,
  GetTraceOpts,
  InventoryDiscoveryKind,
  InventoryObservation,
  LatencyPoint,
  ListLogsOpts,
  ListSessionsOpts,
  ListSpansOpts,
  ListTracesOpts,
  LogRecord,
  RunsPoint,
  SessionSummary,
  SpanSummary,
  TelemetryProvider,
  ToolErrorRow,
  ToolPayloadRow,
  TopOpts,
  TraceSummary,
  WindowOpts,
} from './types'

export type * from './types'

// Cookie wins over env so the settings UI works without a restart. Stale
// cookies (provider whose env is no longer set) fall through to the next tier.
export const PROVIDER_COOKIE = 'tp'

export type ProviderId = 'openobserve' | 'app-insights'

export interface ProviderStatus {
  id: ProviderId
  label: string
  configured: boolean
  missing?: string[]
}

const providers = new Map<ProviderId, TelemetryProvider>()

function buildProvider(id: ProviderId): TelemetryProvider {
  if (id === 'openobserve') {
    return createOpenObserveProvider({
      baseUrl: process.env.OO_BASE_URL ?? 'http://localhost:5080',
      org: process.env.OO_ORG ?? 'default',
      stream: process.env.OO_STREAM ?? 'default',
      user: process.env.OO_USER ?? 'root@example.com',
      password: process.env.OO_PASS ?? 'Complexpass#123',
    })
  }
  // app-insights — prefer resource ID (SDK + Azure AD), fall back to API key
  const resourceId = process.env.APPLICATIONINSIGHTS_RESOURCE_ID
  if (resourceId) return createAppInsightsProvider({ resourceId })
  const appId = process.env.APPLICATIONINSIGHTS_APP_ID ?? process.env.AI_APP_ID
  const apiKey = process.env.APPLICATIONINSIGHTS_API_KEY ?? process.env.AI_API_KEY
  if (!appId || !apiKey) {
    throw new Error(
      'app-insights provider requires APPLICATIONINSIGHTS_RESOURCE_ID or both APPLICATIONINSIGHTS_APP_ID + APPLICATIONINSIGHTS_API_KEY',
    )
  }
  return createAppInsightsProvider({ appId, apiKey })
}

function getProvider(id: ProviderId): TelemetryProvider {
  let p = providers.get(id)
  if (!p) {
    p = buildProvider(id)
    providers.set(id, p)
  }
  return p
}

export function listProviderStatus(): ProviderStatus[] {
  const oo: ProviderStatus = { id: 'openobserve', label: 'OpenObserve', configured: true }
  const ai: ProviderStatus = { id: 'app-insights', label: 'Application Insights', configured: true }
  const hasResourceId = !!process.env.APPLICATIONINSIGHTS_RESOURCE_ID
  const hasApiKey =
    !!(process.env.APPLICATIONINSIGHTS_APP_ID ?? process.env.AI_APP_ID) &&
    !!(process.env.APPLICATIONINSIGHTS_API_KEY ?? process.env.AI_API_KEY)
  if (!hasResourceId && !hasApiKey) {
    ai.configured = false
    ai.missing = ['APPLICATIONINSIGHTS_RESOURCE_ID or APPLICATIONINSIGHTS_APP_ID+API_KEY']
  }
  return [oo, ai]
}

function readCookieChoice(): ProviderId | undefined {
  try {
    const v = getCookie(PROVIDER_COOKIE)
    if (v === 'openobserve' || v === 'app-insights') return v
  } catch {
    // outside a request context (e.g. ad-hoc scripts)
  }
  return undefined
}

function resolveProviderId(): ProviderId {
  const fromCookie = readCookieChoice()
  if (fromCookie) {
    const status = listProviderStatus().find((p) => p.id === fromCookie)
    if (status?.configured) return fromCookie
  }
  const fromEnv = process.env.TELEMETRY_PROVIDER
  if (fromEnv === 'app-insights' || fromEnv === 'openobserve') {
    const status = listProviderStatus().find((p) => p.id === fromEnv)
    if (status?.configured) return fromEnv
  }
  const ai = listProviderStatus().find((p) => p.id === 'app-insights')
  if (ai?.configured) return 'app-insights'
  return 'openobserve'
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
  provider: string
  fingerprint: string
} | null> {
  const p = getActiveProvider()
  if (!p.listTraces) return null
  return { traces: await p.listTraces(opts), provider: p.name, fingerprint: p.fingerprint }
}

export async function listRecentSpans(opts?: ListSpansOpts): Promise<{
  spans: SpanSummary[]
  provider: string
  fingerprint: string
} | null> {
  const p = getActiveProvider()
  if (!p.listSpans) return null
  return { spans: await p.listSpans(opts), provider: p.name, fingerprint: p.fingerprint }
}

export async function listRecentSessions(opts?: ListSessionsOpts): Promise<{
  sessions: SessionSummary[]
  truncated: boolean
  provider: string
  fingerprint: string
} | null> {
  const p = getActiveProvider()
  if (!p.listSessions) return null
  const r = await p.listSessions(opts)
  return { sessions: r.sessions, truncated: r.truncated, provider: p.name, fingerprint: p.fingerprint }
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

export async function listToolErrorRates(opts?: TopOpts): Promise<ToolErrorRow[]> {
  return analytics.fetchToolErrorRates(getActiveProvider(), opts)
}

export async function listToolPayloadSizes(opts?: TopOpts): Promise<ToolPayloadRow[]> {
  return analytics.fetchToolPayloadSizes(getActiveProvider(), opts)
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
