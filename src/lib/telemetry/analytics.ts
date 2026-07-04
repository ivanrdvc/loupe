// Telemetry read helpers. ClickHouse is the only live backend; Fixtures is the
// in-memory e2e double, so each helper short-circuits fixtures then delegates to
// the ClickHouse implementation.

import * as ch from './analytics-clickhouse'
import {
  FIXTURE_INVENTORY,
  FIXTURE_TOOL_ERRORS,
  fixtureToolPayloadBody,
  fixtureToolPayloadOverTime,
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
  ToolPayloadPoint,
  ToolRow,
  TopOpts,
  WindowOpts,
} from './types'

export async function fetchToolErrorRates(p: TelemetryProvider, opts?: TopOpts): Promise<ToolErrorRow[]> {
  if (p.name === 'fixtures') return FIXTURE_TOOL_ERRORS
  return ch.fetchToolErrorRates(p, opts)
}

export async function fetchTools(p: TelemetryProvider, opts?: ToolListOpts): Promise<ToolRow[]> {
  if (p.name === 'fixtures') return fixtureTools(opts?.name)
  return ch.fetchTools(p, opts)
}

export async function fetchToolPayloadBody(p: TelemetryProvider, spanId: string): Promise<RawPayloadBody | null> {
  if (p.name === 'fixtures') return fixtureToolPayloadBody(spanId)
  return ch.fetchToolPayloadBody(p, spanId)
}

export async function fetchToolPayloadOverTime(
  p: TelemetryProvider,
  name: string,
  opts?: WindowOpts,
): Promise<ToolPayloadPoint[]> {
  if (p.name === 'fixtures') return fixtureToolPayloadOverTime(name)
  return ch.fetchToolPayloadOverTime(p, name, opts)
}

export async function fetchChatLatencyOverTime(p: TelemetryProvider, opts?: WindowOpts): Promise<LatencyPoint[]> {
  if (p.name === 'fixtures') return []
  return ch.fetchChatLatencyOverTime(p, opts)
}

export async function fetchCacheHitRateOverTime(p: TelemetryProvider, opts?: WindowOpts): Promise<CacheHitPoint[]> {
  if (p.name === 'fixtures') return []
  return ch.fetchCacheHitRateOverTime(p, opts)
}

export async function fetchRunsPerHour(p: TelemetryProvider, opts?: WindowOpts): Promise<RunsPoint[]> {
  if (p.name === 'fixtures') return []
  return ch.fetchRunsPerHour(p, opts)
}

export async function fetchToolRecentCalls(
  p: TelemetryProvider,
  name: string,
  opts?: WindowOpts & { limit?: number },
): Promise<ToolCallSample[]> {
  if (p.name === 'fixtures') return fixtureToolRecentCalls(name)
  return ch.fetchToolRecentCalls(p, name, opts)
}

export async function fetchInventory(
  p: TelemetryProvider,
  kind: InventoryDiscoveryKind,
  opts?: WindowOpts,
): Promise<InventoryObservation[]> {
  if (p.name === 'fixtures') return kind === 'new_agent' ? FIXTURE_INVENTORY.filter((o) => o.kind === 'agent') : []
  return ch.fetchInventory(p, kind, opts)
}

export async function fetchAgentMetrics(p: TelemetryProvider, opts?: TopOpts): Promise<AgentMetrics[]> {
  if (p.name === 'fixtures') return []
  return ch.fetchAgentMetrics(p, opts)
}
