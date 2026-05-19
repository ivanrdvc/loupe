import { queryOptions } from '@tanstack/react-query'
import { createServerFn } from '@tanstack/react-start'
import { queryKeys, STALE_LIVE_MS } from '#/lib/query-keys'
import { getTrace, listRecentTraces } from '#/lib/telemetry'
import { parse, serialize, type TimeRange, windowUs } from '#/lib/time-range'

const fetchTraceSpans = createServerFn({ method: 'GET' })
  .inputValidator((traceId: string) => traceId)
  .handler(async ({ data }) => {
    return await getTrace(data)
  })

const fetchTraces = createServerFn({ method: 'GET' })
  .inputValidator((input: unknown) => parse(input))
  .handler(async ({ data }) => {
    return await listRecentTraces({ limit: 200, ...windowUs(data) })
  })

export const traceSpansQuery = (traceId: string) =>
  queryOptions({
    queryKey: queryKeys.traces.detail(traceId),
    queryFn: () => fetchTraceSpans({ data: traceId }),
    staleTime: STALE_LIVE_MS,
  })

export const tracesQuery = (range: TimeRange) =>
  queryOptions({
    queryKey: queryKeys.traces.window(serialize(range)),
    queryFn: () => fetchTraces({ data: range }),
    staleTime: STALE_LIVE_MS,
  })
