import { queryOptions } from '@tanstack/react-query'
import { createServerFn } from '@tanstack/react-start'
import { queryKeys } from '#/lib/query-keys'
import { listRecentSessions } from '#/lib/telemetry'
import { DEFAULT, parseRangeUserInput, serialize, type TimeRange, windowUs } from '#/lib/time-range'

const fetchSessions = createServerFn({ method: 'GET' })
  .inputValidator(parseRangeUserInput)
  .handler(async ({ data }) => {
    return await listRecentSessions({
      limit: 50,
      ...windowUs(data.range),
      ...(data.userId ? { userId: data.userId } : {}),
    })
  })

export const sessionsQuery = (range: TimeRange = DEFAULT, userId = '') =>
  queryOptions({
    queryKey: queryKeys.sessions.window(serialize(range), userId),
    queryFn: () => fetchSessions({ data: { range, userId } }),
  })
