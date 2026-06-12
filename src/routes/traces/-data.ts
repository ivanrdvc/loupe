import { queryOptions } from '@tanstack/react-query'
import { createServerFn } from '@tanstack/react-start'
import { queryKeys, STALE_LIVE_MS } from '#/lib/query-keys'
import { listRecentSpans, listRecentTraces } from '#/lib/telemetry'
import { parseRangeUserInput, serialize, type TimeRange, windowUs } from '#/lib/time-range'

const fetchTraces = createServerFn({ method: 'GET' })
  .inputValidator(parseRangeUserInput)
  .handler(async ({ data }) => {
    return await listRecentTraces({
      limit: 200,
      ...windowUs(data.range),
      ...(data.userId ? { userId: data.userId } : {}),
    })
  })

const fetchSpans = createServerFn({ method: 'GET' })
  .inputValidator(parseRangeUserInput)
  .handler(async ({ data }) => {
    return await listRecentSpans({
      limit: 200,
      ...windowUs(data.range),
      ...(data.userId ? { userId: data.userId } : {}),
    })
  })

export const tracesQuery = (range: TimeRange, userId = '') =>
  queryOptions({
    queryKey: queryKeys.traces.window(serialize(range), userId),
    queryFn: () => fetchTraces({ data: { range, userId } }),
    staleTime: STALE_LIVE_MS,
  })

export const spansQuery = (range: TimeRange, userId = '') =>
  queryOptions({
    queryKey: queryKeys.spans.window(serialize(range), userId),
    queryFn: () => fetchSpans({ data: { range, userId } }),
    staleTime: STALE_LIVE_MS,
  })
