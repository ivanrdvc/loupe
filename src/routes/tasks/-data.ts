import { queryOptions } from '@tanstack/react-query'
import { createServerFn } from '@tanstack/react-start'
import { queryKeys, STALE_LIVE_MS } from '#/lib/query-keys'
import { listRecentTraces } from '#/lib/telemetry'
import { parse, serialize, type TimeRange, windowUs } from '#/lib/time-range'

const fetchTasksTraces = createServerFn({ method: 'GET' })
  .inputValidator((input: { range?: unknown; userId?: unknown }) => ({
    range: parse(input.range),
    userId: typeof input.userId === 'string' ? input.userId.trim() : '',
  }))
  .handler(async ({ data }) => {
    return await listRecentTraces({
      limit: 500,
      ...windowUs(data.range),
      ...(data.userId ? { userId: data.userId } : {}),
    })
  })

export const tasksTracesQuery = (range: TimeRange, userId = '') =>
  queryOptions({
    queryKey: queryKeys.tasks.window(serialize(range), userId),
    queryFn: () => fetchTasksTraces({ data: { range, userId } }),
    staleTime: STALE_LIVE_MS,
  })
