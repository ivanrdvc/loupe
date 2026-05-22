import { queryOptions } from '@tanstack/react-query'
import { createServerFn } from '@tanstack/react-start'
import { queryKeys, STALE_LIVE_MS } from '#/lib/query-keys'
import { getTrace, listRecentSpans, listRecentTraces } from '#/lib/telemetry'
import { parse, serialize, type TimeRange, windowUs } from '#/lib/time-range'

const fetchTraceSpans = createServerFn({ method: 'GET' })
  .inputValidator((traceId: string) => traceId)
  .handler(async ({ data }) => {
    return await getTrace(data)
  })

const fetchTraces = createServerFn({ method: 'GET' })
  .inputValidator((input: { range?: unknown; userId?: unknown }) => ({
    range: parse(input.range),
    userId: typeof input.userId === 'string' ? input.userId.trim() : '',
  }))
  .handler(async ({ data }) => {
    return await listRecentTraces({
      limit: 200,
      ...windowUs(data.range),
      ...(data.userId ? { userId: data.userId } : {}),
    })
  })

const fetchSpans = createServerFn({ method: 'GET' })
  .inputValidator((input: { range?: unknown; userId?: unknown }) => ({
    range: parse(input.range),
    userId: typeof input.userId === 'string' ? input.userId.trim() : '',
  }))
  .handler(async ({ data }) => {
    return await listRecentSpans({
      limit: 200,
      ...windowUs(data.range),
      ...(data.userId ? { userId: data.userId } : {}),
    })
  })

export const traceSpansQuery = (traceId: string) =>
  queryOptions({
    queryKey: queryKeys.traces.detail(traceId),
    queryFn: () => fetchTraceSpans({ data: traceId }),
    staleTime: STALE_LIVE_MS,
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
