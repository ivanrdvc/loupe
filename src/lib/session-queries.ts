import { queryOptions } from '@tanstack/react-query'
import { createServerFn } from '@tanstack/react-start'
import { queryKeys } from '#/lib/query-keys'
import { getSession, listRecentSessions } from '#/lib/telemetry'
import { DEFAULT, parse, parseRangeUserInput, serialize, type TimeRange, windowUs } from '#/lib/time-range'

const fetchCurrentUserSessions = createServerFn({ method: 'GET' })
  .inputValidator(parseRangeUserInput)
  .handler(async ({ data }) => {
    if (!data.userId) return { sessions: [] }
    return await listRecentSessions({
      limit: 5,
      ...windowUs(data.range),
      userId: data.userId,
    })
  })

const fetchSession = createServerFn({ method: 'GET' })
  .inputValidator((input: { sessionId: string; range?: unknown }) => ({
    sessionId: input.sessionId,
    range: parse(input.range),
  }))
  .handler(async ({ data }) => {
    return await getSession(data.sessionId, windowUs(data.range))
  })

export const currentUserSessionsQuery = (range: TimeRange = DEFAULT, userId = '') =>
  queryOptions({
    queryKey: queryKeys.sessions.currentUserWindow(serialize(range), userId),
    queryFn: () => fetchCurrentUserSessions({ data: { range, userId } }),
    enabled: userId.length > 0,
  })

export const sessionQuery = (id: string, range: TimeRange = DEFAULT) =>
  queryOptions({
    queryKey: queryKeys.sessions.detailWindow(id, serialize(range)),
    queryFn: () => fetchSession({ data: { sessionId: id, range } }),
  })
