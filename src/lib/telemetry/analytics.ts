// Dispatch on provider name. Each branch is genuinely bespoke — OO speaks
// DataFusion SQL against its flattened-OTel schema; AI speaks KQL against
// `dependencies` + `requests` with `customDimensions`. There's no shared
// dialect to abstract, so the price of a new provider is one branch per file.

import * as ai from './analytics-app-insights'
import * as oo from './analytics-openobserve'
import type {
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

export async function fetchToolErrorRates(p: TelemetryProvider, opts?: TopOpts): Promise<ToolErrorRow[]> {
  switch (p.name) {
    case 'openobserve':
      return oo.fetchToolErrorRates(p, opts)
    case 'app-insights':
      return ai.fetchToolErrorRates(p, opts)
  }
}

export async function fetchToolPayloadSizes(p: TelemetryProvider, opts?: TopOpts): Promise<ToolPayloadRow[]> {
  switch (p.name) {
    case 'openobserve':
      return oo.fetchToolPayloadSizes(p, opts)
    case 'app-insights':
      return ai.fetchToolPayloadSizes(p, opts)
  }
}

export async function fetchChatLatencyOverTime(p: TelemetryProvider, opts?: WindowOpts): Promise<LatencyPoint[]> {
  switch (p.name) {
    case 'openobserve':
      return oo.fetchChatLatencyOverTime(p, opts)
    case 'app-insights':
      return ai.fetchChatLatencyOverTime(p, opts)
  }
}

export async function fetchCacheHitRateOverTime(p: TelemetryProvider, opts?: WindowOpts): Promise<CacheHitPoint[]> {
  switch (p.name) {
    case 'openobserve':
      return oo.fetchCacheHitRateOverTime(p, opts)
    case 'app-insights':
      return ai.fetchCacheHitRateOverTime(p, opts)
  }
}

export async function fetchRunsPerHour(p: TelemetryProvider, opts?: WindowOpts): Promise<RunsPoint[]> {
  switch (p.name) {
    case 'openobserve':
      return oo.fetchRunsPerHour(p, opts)
    case 'app-insights':
      return ai.fetchRunsPerHour(p, opts)
  }
}

export async function fetchAllTools(p: TelemetryProvider, opts?: TopOpts): Promise<ToolCatalogRow[]> {
  switch (p.name) {
    case 'openobserve':
      return oo.fetchAllTools(p, opts)
    case 'app-insights':
      return ai.fetchAllTools(p, opts)
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
  }
}
