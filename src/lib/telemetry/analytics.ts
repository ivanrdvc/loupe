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
  OverviewAggregate,
  OverviewOpts,
  RunsPoint,
  TelemetryProvider,
  ToolErrorRow,
  ToolPayloadRow,
  TopOpts,
  WindowOpts,
} from './types'

export async function fetchOverview(p: TelemetryProvider, opts?: OverviewOpts): Promise<OverviewAggregate> {
  switch (p.name) {
    case 'openobserve':
      return oo.fetchOverview(p, opts)
    case 'app-insights':
      return ai.fetchOverview(p, opts)
  }
}

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
