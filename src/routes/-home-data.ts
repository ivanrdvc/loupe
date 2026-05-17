import { queryOptions } from '@tanstack/react-query'
import { createServerFn } from '@tanstack/react-start'
import { queryKeys, STALE_TELEMETRY_MS } from '#/lib/query-keys'
import { listLatencyPercentiles } from '#/lib/telemetry'
import { DEFAULT, parse, serialize, type TimeRange, windowMs, windowUs } from '#/lib/time-range'
import { runDetection } from '#/server/detection'
import { listHomeInventory } from '#/server/inbox'

const fetchHome = createServerFn({ method: 'GET' })
  .inputValidator((input: unknown) => parse(input))
  .handler(async ({ data }) => {
    const { from, to } = windowMs(data)
    const { fromUs, toUs } = windowUs(data)
    await Promise.allSettled([runDetection('new_tool'), runDetection('new_agent')])
    const [inventory, generationLatency, observationLatency] = await Promise.all([
      listHomeInventory(from, to),
      listLatencyPercentiles('generation', { fromUs, toUs, limit: 10 }).catch(() => []),
      listLatencyPercentiles('observation', { fromUs, toUs, limit: 10 }).catch(() => []),
    ])
    return { ...inventory, generationLatency, observationLatency }
  })

export const homeQuery = (range: TimeRange = DEFAULT) =>
  queryOptions({
    queryKey: queryKeys.home.window(serialize(range)),
    queryFn: () => fetchHome({ data: range }),
    staleTime: STALE_TELEMETRY_MS,
    refetchInterval: STALE_TELEMETRY_MS,
  })
