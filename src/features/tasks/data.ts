import { queryOptions } from '@tanstack/react-query'
import { createServerFn } from '@tanstack/react-start'
import { queryKeys, STALE_LIVE_MS } from '#/lib/query-keys'
import { listRecentTraces } from '#/lib/telemetry'
import { FIRE_TRIGGER_TYPES } from '#/lib/telemetry/trace-category'
import { parseRangeUserInput, serialize, type TimeRange, windowUs } from '#/lib/time-range'

const fetchTasksTraces = createServerFn({ method: 'GET' })
  .inputValidator(parseRangeUserInput)
  .handler(async ({ data }) => {
    return await listRecentTraces({
      limit: 500,
      triggerTypes: FIRE_TRIGGER_TYPES,
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
