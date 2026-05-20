import { queryOptions } from '@tanstack/react-query'
import { createServerFn } from '@tanstack/react-start'
import { LRUCache } from 'lru-cache'
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
import { runDetection } from '#/server/detection'
import { runToolErrorRateDetection, runToolPayloadDetection } from '#/server/detection/anomalies'
import { type InventoryRow, listHomeInventory } from '#/server/inbox'

export type HomeData = {
  newTools: InventoryRow[]
  newAgents: InventoryRow[]
} & {
  toolErrors: ToolErrorRow[]
  toolPayloads: ToolPayloadRow[]
  chatLatencyOverTime: LatencyPoint[]
  cacheHitRateOverTime: CacheHitPoint[]
  runsPerHour: RunsPoint[]
}

const cache = new LRUCache<string, HomeData>({ max: 200 })

function ttlMsFor(range: TimeRange): number {
  const { from, to } = windowMs(range)
  const days = (to - from) / 86_400_000
  if (days <= 1) return 5 * 60_000
  if (days <= 7) return 15 * 60_000
  if (days <= 14) return 30 * 60_000
  return 60 * 60_000
}

const fetchHome = createServerFn({ method: 'GET' })
  .inputValidator((input: unknown) => parse(input))
  .handler(async ({ data }): Promise<HomeData> => {
    const key = `${getActiveProviderId()}:${serialize(data)}`
    const cached = cache.get(key)
    if (cached) return cached

    const { from, to } = windowMs(data)
    const { fromUs, toUs } = windowUs(data)
    void Promise.allSettled([
      runDetection('new_tool'),
      runDetection('new_agent'),
      runToolErrorRateDetection({ fromUs, toUs }),
      runToolPayloadDetection({ fromUs, toUs }),
    ])
    const [inventory, toolErrors, toolPayloads, chatLatencyOverTime, cacheHitRateOverTime, runsPerHour] =
      await Promise.all([
        listHomeInventory(from, to),
        listToolErrorRates({ fromUs, toUs, limit: 5 }).catch(() => []),
        listToolPayloadSizes({ fromUs, toUs, limit: 5 }).catch(() => []),
        listChatLatencyOverTime({ fromUs, toUs }).catch(() => []),
        listCacheHitRateOverTime({ fromUs, toUs }).catch(() => []),
        listRunsPerHour({ fromUs, toUs }).catch(() => []),
      ])
    const result: HomeData = {
      ...inventory,
      toolErrors,
      toolPayloads,
      chatLatencyOverTime,
      cacheHitRateOverTime,
      runsPerHour,
    }
    cache.set(key, result, { ttl: ttlMsFor(data) })
    return result
  })

export const homeQuery = (range: TimeRange = DEFAULT) =>
  queryOptions({
    queryKey: queryKeys.home.window(serialize(range)),
    queryFn: () => fetchHome({ data: range }),
    staleTime: STALE_TELEMETRY_MS,
    refetchInterval: STALE_TELEMETRY_MS,
  })
