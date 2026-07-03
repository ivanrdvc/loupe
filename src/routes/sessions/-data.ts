import { keepPreviousData, queryOptions } from '@tanstack/react-query'
import { createServerFn } from '@tanstack/react-start'
import { ensureSession } from '#/lib/auth/guards'
import { queryKeys } from '#/lib/query-keys'
import { listRecentSessions } from '#/lib/telemetry'
import { DEFAULT, parseRangeUserInput, serialize, type TimeRange, windowUs } from '#/lib/time-range'

export const SESSIONS_PAGE_SIZE = 50

const parseSessionsInput = (input: unknown) => {
  const raw = (input ?? {}) as Record<string, unknown>
  const page = Math.max(0, Math.floor(Number(raw.page) || 0))
  return { ...parseRangeUserInput(raw), page }
}

const fetchSessions = createServerFn({ method: 'GET' })
  .inputValidator(parseSessionsInput)
  .handler(async ({ data }) => {
    await ensureSession()
    return await listRecentSessions({
      limit: SESSIONS_PAGE_SIZE,
      offset: data.page * SESSIONS_PAGE_SIZE,
      ...windowUs(data.range),
      ...(data.userId ? { userId: data.userId } : {}),
      ...(data.host ? { host: data.host } : {}),
    })
  })

export const sessionsQuery = (range: TimeRange = DEFAULT, userId = '', host = '', page = 0) =>
  queryOptions({
    queryKey: [...queryKeys.sessions.window(serialize(range), userId, host), page] as const,
    queryFn: () => fetchSessions({ data: { range, userId, host, page } }),
    placeholderData: keepPreviousData,
  })
