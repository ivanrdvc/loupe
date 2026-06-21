import { queryOptions } from '@tanstack/react-query'
import { createServerFn } from '@tanstack/react-start'
import { queryKeys, STALE_TELEMETRY_MS } from '#/lib/query-keys'
import {
  getToolPayloadBody,
  listToolRecentCalls,
  listTools,
  type ToolDimensionFilter,
  type ToolPayloadBody,
  type ToolRow,
} from '#/lib/telemetry'
import { isToolDimensionField } from '#/lib/telemetry/conventions'
import { DEFAULT, parse, serialize, type TimeRange, windowUs } from '#/lib/time-range'

// Queried live: React Query's staleTime is the only cache, so the window and
// dimensions in the key can't disagree the way the old per-name LRU caches did.

function parseDimensions(input: unknown): ToolDimensionFilter[] {
  if (!Array.isArray(input)) return []
  const out: ToolDimensionFilter[] = []
  for (const d of input) {
    if (!d || typeof d !== 'object') continue
    const { field, value } = d as { field?: unknown; value?: unknown }
    if (typeof field === 'string' && isToolDimensionField(field) && typeof value === 'string' && value) {
      out.push({ field, value })
    }
  }
  return out
}

const parseToolsInput = (input: unknown): { range: TimeRange; dimensions: ToolDimensionFilter[] } => {
  const obj = (input && typeof input === 'object' ? input : {}) as Record<string, unknown>
  return { range: parse(obj.range), dimensions: parseDimensions(obj.dimensions) }
}

const parseToolInput = (input: unknown): { name: string; range: TimeRange } => {
  const obj = (input && typeof input === 'object' ? input : {}) as Record<string, unknown>
  if (typeof obj.name !== 'string' || !obj.name) throw new Error('expected tool name')
  return { name: obj.name, range: parse(obj.range) }
}

const spanIdValidator = (input: unknown): string => {
  if (typeof input !== 'string' || !input) throw new Error('expected span id')
  return input
}

const fetchCatalog = createServerFn({ method: 'GET' })
  .inputValidator(parseToolsInput)
  .handler(async ({ data }): Promise<ToolRow[]> => {
    const { fromUs, toUs } = windowUs(data.range)
    return listTools({ fromUs, toUs, limit: 1000, dimensions: data.dimensions })
  })

const fetchTool = createServerFn({ method: 'GET' })
  .inputValidator(parseToolInput)
  .handler(async ({ data }): Promise<ToolRow | null> => {
    const { fromUs, toUs } = windowUs(data.range)
    const rows = await listTools({ fromUs, toUs, name: data.name })
    return rows[0] ?? null
  })

const fetchRecent = createServerFn({ method: 'GET' })
  .inputValidator(parseToolInput)
  .handler(async ({ data }) => {
    const { fromUs, toUs } = windowUs(data.range)
    return listToolRecentCalls(data.name, { fromUs, toUs, limit: 8 })
  })

const fetchBody = createServerFn({ method: 'GET' })
  .inputValidator(spanIdValidator)
  .handler(async ({ data }): Promise<ToolPayloadBody | null> => getToolPayloadBody(data))

// The full per-tool aggregate set. Shared by the /tools catalog and the
// inspector's health hint — same numbers, one cached query.
export const toolsCatalogQuery = (range: TimeRange = DEFAULT, dimensions: ToolDimensionFilter[] = []) =>
  queryOptions({
    queryKey: queryKeys.tools.catalog(serialize(range), dimensions.length ? JSON.stringify(dimensions) : undefined),
    queryFn: () => fetchCatalog({ data: { range, dimensions } }),
    staleTime: STALE_TELEMETRY_MS,
  })

export const toolDetailQuery = (name: string, range: TimeRange = DEFAULT) =>
  queryOptions({
    queryKey: queryKeys.tools.detail(name, serialize(range)),
    queryFn: () => fetchTool({ data: { name, range } }),
    staleTime: STALE_TELEMETRY_MS,
  })

export const toolRecentCallsQuery = (name: string, range: TimeRange = DEFAULT) =>
  queryOptions({
    queryKey: queryKeys.tools.recent(name, serialize(range)),
    queryFn: () => fetchRecent({ data: { name, range } }),
    staleTime: STALE_TELEMETRY_MS,
  })

export const toolPayloadBodyQuery = (spanId: string) =>
  queryOptions({
    queryKey: queryKeys.tools.body(spanId),
    queryFn: () => fetchBody({ data: spanId }),
    staleTime: STALE_TELEMETRY_MS,
  })
