// Dispatch on provider name. Each branch is genuinely bespoke — OO speaks
// DataFusion SQL against its flattened-OTel schema; AI speaks KQL against
// `dependencies` + `requests` with `customDimensions`. There's no shared
// dialect to abstract, so the price of a new provider is one branch per file.

import * as ai from './analytics-app-insights'
import * as oo from './analytics-openobserve'
import {
  FIXTURE_TOOL_CATALOG,
  FIXTURE_TOOL_ERRORS,
  FIXTURE_TOOL_PAYLOADS,
  fixtureToolDetail,
  fixtureToolRecentCalls,
} from './fixtures'
import type {
  AgentMetrics,
  CacheHitPoint,
  InventoryDiscoveryKind,
  InventoryObservation,
  LatencyPoint,
  RunsPoint,
  TelemetryProvider,
  ToolCallSample,
  ToolCatalogRow,
  ToolDetail,
  ToolErrorRow,
  ToolPayloadRow,
  TopOpts,
  WindowOpts,
} from './types'

function assertNever(p: never): never {
  throw new Error(`unhandled telemetry provider: ${(p as TelemetryProvider).name}`)
}

export async function fetchToolErrorRates(p: TelemetryProvider, opts?: TopOpts): Promise<ToolErrorRow[]> {
  switch (p.name) {
    case 'openobserve':
      return oo.fetchToolErrorRates(p, opts)
    case 'app-insights':
      return ai.fetchToolErrorRates(p, opts)
    case 'fixtures':
      return FIXTURE_TOOL_ERRORS
    default:
      return assertNever(p)
  }
}

export async function fetchToolPayloadSizes(p: TelemetryProvider, opts?: TopOpts): Promise<ToolPayloadRow[]> {
  switch (p.name) {
    case 'openobserve':
      return oo.fetchToolPayloadSizes(p, opts)
    case 'app-insights':
      return ai.fetchToolPayloadSizes(p, opts)
    case 'fixtures':
      return FIXTURE_TOOL_PAYLOADS
    default:
      return assertNever(p)
  }
}

export async function fetchChatLatencyOverTime(p: TelemetryProvider, opts?: WindowOpts): Promise<LatencyPoint[]> {
  switch (p.name) {
    case 'openobserve':
      return oo.fetchChatLatencyOverTime(p, opts)
    case 'app-insights':
      return ai.fetchChatLatencyOverTime(p, opts)
    case 'fixtures':
      return []
    default:
      return assertNever(p)
  }
}

export async function fetchCacheHitRateOverTime(p: TelemetryProvider, opts?: WindowOpts): Promise<CacheHitPoint[]> {
  switch (p.name) {
    case 'openobserve':
      return oo.fetchCacheHitRateOverTime(p, opts)
    case 'app-insights':
      return ai.fetchCacheHitRateOverTime(p, opts)
    case 'fixtures':
      return []
    default:
      return assertNever(p)
  }
}

export async function fetchRunsPerHour(p: TelemetryProvider, opts?: WindowOpts): Promise<RunsPoint[]> {
  switch (p.name) {
    case 'openobserve':
      return oo.fetchRunsPerHour(p, opts)
    case 'app-insights':
      return ai.fetchRunsPerHour(p, opts)
    case 'fixtures':
      return []
    default:
      return assertNever(p)
  }
}

export async function fetchAllTools(p: TelemetryProvider, opts?: TopOpts): Promise<ToolCatalogRow[]> {
  switch (p.name) {
    case 'openobserve':
      return oo.fetchAllTools(p, opts)
    case 'app-insights':
      return ai.fetchAllTools(p, opts)
    case 'fixtures':
      return FIXTURE_TOOL_CATALOG
    default:
      return assertNever(p)
  }
}

export async function fetchToolDetail(
  p: TelemetryProvider,
  name: string,
  opts?: WindowOpts,
): Promise<ToolDetail | null> {
  switch (p.name) {
    case 'openobserve':
      return oo.fetchToolDetail(p, name, opts)
    case 'app-insights':
      return ai.fetchToolDetail(p, name, opts)
    case 'fixtures':
      return fixtureToolDetail(name)
    default:
      return assertNever(p)
  }
}

export async function fetchToolRecentCalls(
  p: TelemetryProvider,
  name: string,
  opts?: WindowOpts & { limit?: number },
): Promise<ToolCallSample[]> {
  switch (p.name) {
    case 'openobserve':
      return oo.fetchToolRecentCalls(p, name, opts)
    case 'app-insights':
      return ai.fetchToolRecentCalls(p, name, opts)
    case 'fixtures':
      return fixtureToolRecentCalls(name)
    default:
      return assertNever(p)
  }
}

export async function fetchInventory(
  p: TelemetryProvider,
  kind: InventoryDiscoveryKind,
  opts?: WindowOpts,
): Promise<InventoryObservation[]> {
  switch (p.name) {
    case 'openobserve':
      return oo.fetchInventory(p, kind, opts)
    case 'app-insights':
      return ai.fetchInventory(p, kind, opts)
    case 'fixtures':
      return []
    default:
      return assertNever(p)
  }
}

export async function fetchAgentMetrics(p: TelemetryProvider, opts?: TopOpts): Promise<AgentMetrics[]> {
  switch (p.name) {
    case 'openobserve':
      return oo.fetchAgentMetrics(p, opts)
    case 'app-insights':
      return ai.fetchAgentMetrics(p, opts)
    case 'fixtures':
      return []
    default:
      return assertNever(p)
  }
}
