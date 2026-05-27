import { queryOptions } from '@tanstack/react-query'
import { createServerFn } from '@tanstack/react-start'
import { LRUCache } from 'lru-cache'
import { queryKeys, STALE_TELEMETRY_MS } from '#/lib/query-keys'
import { getActiveProviderId, listAllTools, type ToolCatalogRow } from '#/lib/telemetry'
import { DEFAULT, parse, serialize, type TimeRange, windowUs } from '#/lib/time-range'

const cache = new LRUCache<string, ToolCatalogRow[]>({ max: 100 })

const ttlMs = (range: TimeRange) => {
  const us = windowUs(range)
  const days = (us.toUs - us.fromUs) / 1_000_000 / 86_400
  if (days <= 1) return 5 * 60_000
  if (days <= 7) return 15 * 60_000
  return 30 * 60_000
}

const fetchTools = createServerFn({ method: 'GET' })
  .inputValidator((input: unknown) => parse(input))
  .handler(async ({ data }): Promise<ToolCatalogRow[]> => {
    const key = `${getActiveProviderId()}:${serialize(data)}`
    const cached = cache.get(key)
    if (cached) return cached
    const { fromUs, toUs } = windowUs(data)
    const result = await listAllTools({ fromUs, toUs, limit: 1000 })
    cache.set(key, result, { ttl: ttlMs(data) })
    return result
  })

export const toolsCatalogQuery = (range: TimeRange = DEFAULT) =>
  queryOptions({
    queryKey: queryKeys.tools.catalog(serialize(range)),
    queryFn: () => fetchTools({ data: range }),
    staleTime: STALE_TELEMETRY_MS,
  })
