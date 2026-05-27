import { queryOptions } from '@tanstack/react-query'
import { createServerFn } from '@tanstack/react-start'
import { LRUCache } from 'lru-cache'
import { queryKeys, STALE_TELEMETRY_MS } from '#/lib/query-keys'
import {
  getActiveProviderId,
  getToolDetail,
  listToolRecentCalls,
  type ToolCallSample,
  type ToolDetail,
} from '#/lib/telemetry'

const detailCache = new LRUCache<string, ToolDetail>({ max: 500, ttl: 5 * 60_000 })
const recentCache = new LRUCache<string, ToolCallSample[]>({ max: 500, ttl: 2 * 60_000 })

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
    const result = await listToolRecentCalls(data, { limit: 50 })
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
