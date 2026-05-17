import { queryOptions } from '@tanstack/react-query'
import { createServerFn } from '@tanstack/react-start'
import { queryKeys, STALE_TELEMETRY_MS } from '#/lib/query-keys'
import {
  listLatencyPercentiles,
  listToolErrorRates,
  listToolErrorRatesBucketed,
  listToolPayloadSizes,
  listToolPayloadSizesBucketed,
} from '#/lib/telemetry'
import { DEFAULT, parse, serialize, type TimeRange, windowMs, windowUs } from '#/lib/time-range'
import { runDetection } from '#/server/detection'
import { runToolErrorRateDetection, runToolPayloadDetection } from '#/server/detection/anomalies'
import { listHomeInventory } from '#/server/inbox'

const fetchHome = createServerFn({ method: 'GET' })
  .inputValidator((input: unknown) => parse(input))
  .handler(async ({ data }) => {
    const { from, to } = windowMs(data)
    const { fromUs, toUs } = windowUs(data)
    // Fire-and-forget detection — anomalies surface in the inbox table on the next refetch.
    void Promise.allSettled([
      runDetection('new_tool'),
      runDetection('new_agent'),
      runToolErrorRateDetection({ fromUs, toUs }),
      runToolPayloadDetection({ fromUs, toUs }),
    ])
    const [
      inventory,
      generationLatency,
      observationLatency,
      toolErrors,
      toolPayloads,
      toolErrorsSpark,
      toolPayloadsSpark,
    ] = await Promise.all([
      listHomeInventory(from, to),
      listLatencyPercentiles('generation', { fromUs, toUs, limit: 10 }).catch(() => []),
      listLatencyPercentiles('observation', { fromUs, toUs, limit: 10 }).catch(() => []),
      listToolErrorRates({ fromUs, toUs, limit: 5 }).catch(() => []),
      listToolPayloadSizes({ fromUs, toUs, limit: 5 }).catch(() => []),
      listToolErrorRatesBucketed({ fromUs, toUs }).catch(() => []),
      listToolPayloadSizesBucketed({ fromUs, toUs }).catch(() => []),
    ])
    return {
      ...inventory,
      generationLatency,
      observationLatency,
      toolErrors,
      toolPayloads,
      toolErrorsSpark,
      toolPayloadsSpark,
    }
  })

export const homeQuery = (range: TimeRange = DEFAULT) =>
  queryOptions({
    queryKey: queryKeys.home.window(serialize(range)),
    queryFn: () => fetchHome({ data: range }),
    staleTime: STALE_TELEMETRY_MS,
    refetchInterval: STALE_TELEMETRY_MS,
  })
