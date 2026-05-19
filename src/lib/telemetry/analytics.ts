// Dispatch on provider name. Each branch is genuinely bespoke — OO speaks
// DataFusion SQL against its flattened-OTel schema; AI speaks KQL against
// `dependencies` + `requests` with `customDimensions`. There's no shared
// dialect to abstract, so the price of a new provider is one branch per file.

import * as ai from './analytics-app-insights'
import * as oo from './analytics-openobserve'
import type {
  InventoryDiscoveryKind,
  InventoryObservation,
  LatencyKind,
  LatencyOpts,
  LatencyRow,
  OverviewAggregate,
  OverviewOpts,
  TelemetryProvider,
  ToolErrorRow,
  ToolPayloadRow,
  ToolSpark,
  TopOpts,
  WindowOpts,
} from './types'

export async function fetchOverview(p: TelemetryProvider, opts?: OverviewOpts): Promise<OverviewAggregate> {
  switch (p.name) {
    case 'openobserve':
      return oo.fetchOverview(p, opts)
    case 'app-insights':
      return { runs: 0, erroredRuns: 0, p95ChatMs: 0, totalCostUsd: 0 }
  }
}

export async function fetchLatencyPercentiles(
  p: TelemetryProvider,
  kind: LatencyKind,
  opts?: LatencyOpts,
): Promise<LatencyRow[]> {
  switch (p.name) {
    case 'openobserve':
      return oo.fetchLatencyPercentiles(p, kind, opts)
    case 'app-insights':
      return ai.fetchLatencyPercentiles(p, kind, opts)
  }
}

export async function fetchToolErrorRates(p: TelemetryProvider, opts?: TopOpts): Promise<ToolErrorRow[]> {
  switch (p.name) {
    case 'openobserve':
      return oo.fetchToolErrorRates(p, opts)
    case 'app-insights':
      return []
  }
}

export async function fetchToolPayloadSizes(p: TelemetryProvider, opts?: TopOpts): Promise<ToolPayloadRow[]> {
  switch (p.name) {
    case 'openobserve':
      return oo.fetchToolPayloadSizes(p, opts)
    case 'app-insights':
      return []
  }
}

export async function fetchToolErrorRatesBucketed(p: TelemetryProvider, opts?: TopOpts): Promise<ToolSpark[]> {
  switch (p.name) {
    case 'openobserve':
      return oo.fetchToolErrorRatesBucketed(p, opts)
    case 'app-insights':
      return []
  }
}

export async function fetchToolPayloadSizesBucketed(p: TelemetryProvider, opts?: TopOpts): Promise<ToolSpark[]> {
  switch (p.name) {
    case 'openobserve':
      return oo.fetchToolPayloadSizesBucketed(p, opts)
    case 'app-insights':
      return []
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
