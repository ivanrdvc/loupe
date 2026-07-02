import { queryOptions } from '@tanstack/react-query'
import { createServerFn } from '@tanstack/react-start'
import { ensureSession } from '#/lib/auth/guards'
import { queryKeys } from '#/lib/query-keys'
import { listRecentSessions } from '#/lib/telemetry'
import { DEFAULT, parseRangeUserInput, serialize, type TimeRange, windowUs } from '#/lib/time-range'

const fetchSessions = createServerFn({ method: 'GET' })
  .inputValidator(parseRangeUserInput)
  .handler(async ({ data }) => {
    await ensureSession()
    return await listRecentSessions({
      limit: 50,
      ...windowUs(data.range),
      ...(data.userId ? { userId: data.userId } : {}),
      ...(data.host ? { host: data.host } : {}),
    })
  })

export const sessionsQuery = (range: TimeRange = DEFAULT, userId = '', host = '') =>
  queryOptions({
    queryKey: queryKeys.sessions.window(serialize(range), userId, host),
    queryFn: () => fetchSessions({ data: { range, userId, host } }),
  })
