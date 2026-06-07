import { queryOptions } from '@tanstack/react-query'
import { createServerFn } from '@tanstack/react-start'
import { LRUCache } from 'lru-cache'
import { queryKeys, STALE_TELEMETRY_MS } from '#/lib/query-keys'
import {
  getActiveProviderId,
  getToolDetail,
  listAllTools,
  listToolRecentCalls,
  type ToolCallSample,
  type ToolCatalogRow,
  type ToolDetail,
} from '#/lib/telemetry'
import { DEFAULT, parse, serialize, type TimeRange, windowUs } from '#/lib/time-range'

const detailCache = new LRUCache<string, ToolDetail>({ max: 500, ttl: 5 * 60_000 })
const recentCache = new LRUCache<string, ToolCallSample[]>({ max: 500, ttl: 2 * 60_000 })
const catalogCache = new LRUCache<string, ToolCatalogRow[]>({ max: 100 })

const catalogTtlMs = (range: TimeRange) => {
  const us = windowUs(range)
  const days = (us.toUs - us.fromUs) / 1_000_000 / 86_400
  if (days <= 1) return 5 * 60_000
  if (days <= 7) return 15 * 60_000
  return 30 * 60_000
}

const toolNameValidator = (input: unknown): string => {
  if (typeof input !== 'string' || !input) throw new Error('expected tool name')
  return input
}

const fetchDetail = createServerFn({ method: 'GET' })
  .inputValidator(toolNameValidator)
  .handler(async ({ data }) => {
    const key = `${getActiveProviderId()}:${data}`
    const cached = detailCache.get(key)
    if (cached) return cached
    const result = await getToolDetail(data)
    if (result) detailCache.set(key, result)
    return result
  })

const fetchRecent = createServerFn({ method: 'GET' })
  .inputValidator(toolNameValidator)
  .handler(async ({ data }) => {
    const key = `${getActiveProviderId()}:${data}`
    const cached = recentCache.get(key)
    if (cached) return cached
    const result = await listToolRecentCalls(data, { limit: 8 })
    recentCache.set(key, result)
    return result
  })

export const toolDetailQuery = (name: string) =>
  queryOptions({
    queryKey: queryKeys.tools.detail(name),
    queryFn: () => fetchDetail({ data: name }),
    staleTime: STALE_TELEMETRY_MS,
  })

export const toolRecentCallsQuery = (name: string) =>
  queryOptions({
    queryKey: queryKeys.tools.recent(name),
    queryFn: () => fetchRecent({ data: name }),
    staleTime: STALE_TELEMETRY_MS,
  })

const fetchCatalog = createServerFn({ method: 'GET' })
  .inputValidator((input: unknown) => parse(input))
  .handler(async ({ data }): Promise<ToolCatalogRow[]> => {
    const key = `${getActiveProviderId()}:${serialize(data)}`
    const cached = catalogCache.get(key)
    if (cached) return cached
    const { fromUs, toUs } = windowUs(data)
    const result = await listAllTools({ fromUs, toUs, limit: 1000 })
    catalogCache.set(key, result, { ttl: catalogTtlMs(data) })
    return result
  })

// The full per-tool aggregate set. Shared by the /tools catalog and the
// inspector's at-a-glance health hint — same numbers, one cached fetch.
export const toolsCatalogQuery = (range: TimeRange = DEFAULT) =>
  queryOptions({
    queryKey: queryKeys.tools.catalog(serialize(range)),
    queryFn: () => fetchCatalog({ data: range }),
    staleTime: STALE_TELEMETRY_MS,
  })
