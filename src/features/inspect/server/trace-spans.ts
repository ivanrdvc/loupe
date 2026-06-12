import { queryOptions } from '@tanstack/react-query'
import { createServerFn } from '@tanstack/react-start'
import { queryKeys, STALE_LIVE_MS } from '#/lib/query-keys'
import { getTrace } from '#/lib/telemetry'

const fetchTraceSpans = createServerFn({ method: 'GET' })
  .inputValidator((traceId: string) => traceId)
  .handler(async ({ data }) => {
    return await getTrace(data)
  })

export const traceSpansQuery = (traceId: string) =>
  queryOptions({
    queryKey: queryKeys.traces.detail(traceId),
    queryFn: () => fetchTraceSpans({ data: traceId }),
    staleTime: STALE_LIVE_MS,
  })
