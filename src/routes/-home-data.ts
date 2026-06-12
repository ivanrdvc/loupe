import { queryOptions } from '@tanstack/react-query'
import { createServerFn } from '@tanstack/react-start'
import { LRUCache } from 'lru-cache'
import { recoverStuckEvalRuns } from '#/features/evaluation/server/eval-jobs'
import { runOnlineEvals } from '#/features/evaluation/server/online-evals'
import { runDetection } from '#/features/inventory/detection'
import { runToolPayloadDetection } from '#/features/inventory/detection/anomalies'
import { type InventoryRow, listHomeInventory } from '#/features/inventory/server'
import { queryKeys, STALE_TELEMETRY_MS } from '#/lib/query-keys'
import {
  type CacheHitPoint,
  getActiveProviderId,
  type LatencyPoint,
  listCacheHitRateOverTime,
  listChatLatencyOverTime,
  listRunsPerHour,
  listToolErrorRates,
  listToolPayloadSizes,
  type RunsPoint,
  type ToolErrorRow,
  type ToolPayloadRow,
} from '#/lib/telemetry'
import { DEFAULT, parse, serialize, type TimeRange, windowMs, windowUs } from '#/lib/time-range'

export type HomeInbox = {
  newTools: InventoryRow[]
  newAgents: InventoryRow[]
  toolErrors: ToolErrorRow[]
  toolPayloads: ToolPayloadRow[]
}

function ttlMsFor(range: TimeRange): number {
  const { from, to } = windowMs(range)
  const days = (to - from) / 86_400_000
  if (days <= 1) return 5 * 60_000
  if (days <= 7) return 15 * 60_000
  if (days <= 14) return 30 * 60_000
  return 60 * 60_000
}

const inboxCache = new LRUCache<string, HomeInbox>({ max: 200 })
const latencyCache = new LRUCache<string, LatencyPoint[]>({ max: 200 })
const cacheHitCache = new LRUCache<string, CacheHitPoint[]>({ max: 200 })
const runsCache = new LRUCache<string, RunsPoint[]>({ max: 200 })

const fetchInbox = createServerFn({ method: 'GET' })
  .inputValidator((input: unknown) => parse(input))
  .handler(async ({ data }): Promise<HomeInbox> => {
    const key = `${getActiveProviderId()}:${serialize(data)}`
    const cached = inboxCache.get(key)
    if (cached) return cached

    const { from, to } = windowMs(data)
    const { fromUs, toUs } = windowUs(data)
    void Promise.allSettled([
      runDetection('new_tool'),
      runDetection('new_agent'),
      runToolPayloadDetection({ fromUs, toUs }),
      recoverStuckEvalRuns(),
      runOnlineEvals(),
    ])
    const [inventory, toolErrors, toolPayloads] = await Promise.all([
      listHomeInventory(from, to),
      listToolErrorRates({ fromUs, toUs, limit: 5 }).catch(() => []),
      listToolPayloadSizes({ fromUs, toUs, limit: 5 }).catch(() => []),
    ])
    const result: HomeInbox = { ...inventory, toolErrors, toolPayloads }
    inboxCache.set(key, result, { ttl: ttlMsFor(data) })
    return result
  })

const fetchLatency = createServerFn({ method: 'GET' })
  .inputValidator((input: unknown) => parse(input))
  .handler(async ({ data }): Promise<LatencyPoint[]> => {
    const key = `${getActiveProviderId()}:${serialize(data)}`
    const cached = latencyCache.get(key)
    if (cached) return cached
    const { fromUs, toUs } = windowUs(data)
    const result = await listChatLatencyOverTime({ fromUs, toUs }).catch(() => [])
    latencyCache.set(key, result, { ttl: ttlMsFor(data) })
    return result
  })

const fetchCacheHit = createServerFn({ method: 'GET' })
  .inputValidator((input: unknown) => parse(input))
  .handler(async ({ data }): Promise<CacheHitPoint[]> => {
    const key = `${getActiveProviderId()}:${serialize(data)}`
    const cached = cacheHitCache.get(key)
    if (cached) return cached
    const { fromUs, toUs } = windowUs(data)
    const result = await listCacheHitRateOverTime({ fromUs, toUs }).catch(() => [])
    cacheHitCache.set(key, result, { ttl: ttlMsFor(data) })
    return result
  })

const fetchRunsPerHour = createServerFn({ method: 'GET' })
  .inputValidator((input: unknown) => parse(input))
  .handler(async ({ data }): Promise<RunsPoint[]> => {
    const key = `${getActiveProviderId()}:${serialize(data)}`
    const cached = runsCache.get(key)
    if (cached) return cached
    const { fromUs, toUs } = windowUs(data)
    const result = await listRunsPerHour({ fromUs, toUs }).catch(() => [])
    runsCache.set(key, result, { ttl: ttlMsFor(data) })
    return result
  })

export const homeInboxQuery = (range: TimeRange = DEFAULT) =>
  queryOptions({
    queryKey: [...queryKeys.home.window(serialize(range)), 'inbox'] as const,
    queryFn: () => fetchInbox({ data: range }),
    staleTime: STALE_TELEMETRY_MS,
    refetchInterval: STALE_TELEMETRY_MS,
  })

export const chatLatencyOverTimeQuery = (range: TimeRange = DEFAULT) =>
  queryOptions({
    queryKey: [...queryKeys.home.window(serialize(range)), 'latency'] as const,
    queryFn: () => fetchLatency({ data: range }),
    staleTime: STALE_TELEMETRY_MS,
    refetchInterval: STALE_TELEMETRY_MS,
  })

export const cacheHitRateOverTimeQuery = (range: TimeRange = DEFAULT) =>
  queryOptions({
    queryKey: [...queryKeys.home.window(serialize(range)), 'cache'] as const,
    queryFn: () => fetchCacheHit({ data: range }),
    staleTime: STALE_TELEMETRY_MS,
    refetchInterval: STALE_TELEMETRY_MS,
  })

export const runsPerHourQuery = (range: TimeRange = DEFAULT) =>
  queryOptions({
    queryKey: [...queryKeys.home.window(serialize(range)), 'runs'] as const,
    queryFn: () => fetchRunsPerHour({ data: range }),
    staleTime: STALE_TELEMETRY_MS,
    refetchInterval: STALE_TELEMETRY_MS,
  })
