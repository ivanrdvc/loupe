// Dispatch on provider name. Each branch is genuinely bespoke — OO speaks
// DataFusion SQL against its flattened-OTel schema; AI speaks KQL against
// `dependencies` + `requests` with `customDimensions`. There's no shared
// dialect to abstract, so the price of a new provider is one branch per file.

import * as ai from './analytics-app-insights'
import * as oo from './analytics-openobserve'
import {
  FIXTURE_INVENTORY,
  FIXTURE_TOOL_ERRORS,
  fixtureToolPayloadBody,
  fixtureToolRecentCalls,
  fixtureTools,
} from './fixtures'
import type {
  AgentMetrics,
  CacheHitPoint,
  InventoryDiscoveryKind,
  InventoryObservation,
  LatencyPoint,
  RawPayloadBody,
  RunsPoint,
  TelemetryProvider,
  ToolCallSample,
  ToolErrorRow,
  ToolListOpts,
  ToolRow,
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

export async function fetchTools(p: TelemetryProvider, opts?: ToolListOpts): Promise<ToolRow[]> {
  switch (p.name) {
    case 'openobserve':
      return oo.fetchTools(p, opts)
    case 'app-insights':
      return ai.fetchTools(p, opts)
    case 'fixtures':
      return fixtureTools(opts?.name)
    default:
      return assertNever(p)
  }
}

export async function fetchToolPayloadBody(p: TelemetryProvider, spanId: string): Promise<RawPayloadBody | null> {
  switch (p.name) {
    case 'openobserve':
      return oo.fetchToolPayloadBody(p, spanId)
    case 'app-insights':
      return ai.fetchToolPayloadBody(p, spanId)
    case 'fixtures':
      return fixtureToolPayloadBody(spanId)
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
      return kind === 'new_agent' ? FIXTURE_INVENTORY.filter((o) => o.kind === 'agent') : []
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
