import { mapLatencyRow } from './shared'
import type {
  AppInsightsProvider,
  InventoryDiscoveryKind,
  InventoryObservation,
  LatencyKind,
  LatencyOpts,
  LatencyRow,
  WindowOpts,
} from './types'

export async function fetchLatencyPercentiles(
  p: AppInsightsProvider,
  kind: LatencyKind,
  opts?: LatencyOpts,
): Promise<LatencyRow[]> {
  const limit = opts?.limit ?? 5
  const filter =
    kind === 'generation'
      ? `| where tostring(customDimensions["gen_ai.operation.name"]) == "chat"`
      : `| where name startswith "invoke_agent " or tostring(customDimensions["gen_ai.operation.name"]) == "chat"`
  const q = `
    union dependencies, requests
    ${filter}
    | summarize
        p50_ms = percentile(duration, 50),
        p90_ms = percentile(duration, 90),
        p95_ms = percentile(duration, 95),
        p99_ms = percentile(duration, 99),
        count = count()
      by name
    | top ${limit} by p95_ms desc
  `
  const rows = await p.query(q, opts ?? {})
  return rows.map(mapLatencyRow)
}

export async function fetchInventory(
  p: AppInsightsProvider,
  kind: InventoryDiscoveryKind,
  opts?: WindowOpts,
): Promise<InventoryObservation[]> {
  const prefix = kind === 'new_tool' ? 'execute_tool' : 'invoke_agent'
  const q = `
    union dependencies, requests
    | where name startswith "${prefix} "
    | summarize
        first_seen = min(timestamp),
        last_seen  = max(timestamp),
        sample_trace_id = any(operation_Id)
      by operation_name = name
    | top 1000 by first_seen desc
  `
  const rows = await p.query(q, opts ?? {})
  return rows.map((r) => rowToInventoryObservation(kind, r)).filter((o): o is InventoryObservation => o !== null)
}

function rowToInventoryObservation(
  kind: InventoryDiscoveryKind,
  row: Record<string, unknown>,
): InventoryObservation | null {
  const operationName = String(row.operation_name ?? '')
  const name =
    kind === 'new_tool'
      ? operationName.match(/^execute_tool\s+(\S+)/)?.[1]
      : operationName.match(/^invoke_agent\s+([^(\s]+)/)?.[1]
  if (!name) return null
  const firstSeen = typeof row.first_seen === 'string' ? Date.parse(row.first_seen) : 0
  const lastSeen = typeof row.last_seen === 'string' ? Date.parse(row.last_seen) : firstSeen
  return {
    kind: kind === 'new_tool' ? 'mcp_tool' : 'agent',
    name,
    namespace: '',
    firstSeenMs: firstSeen,
    lastSeenMs: lastSeen,
    traceId: typeof row.sample_trace_id === 'string' ? row.sample_trace_id : undefined,
  }
}
