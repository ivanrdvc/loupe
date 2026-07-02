import { queryOptions } from '@tanstack/react-query'
import { createServerFn } from '@tanstack/react-start'
import { ensureSession } from '#/lib/auth/guards'
import { queryKeys } from '#/lib/query-keys'
import { getSession, listRecentSessions } from '#/lib/telemetry'
import { DEFAULT, parse, serialize, type TimeRange, windowUs } from '#/lib/time-range'

const fetchRecentSessions = createServerFn({ method: 'GET' })
  .inputValidator((input: { range?: unknown }) => ({ range: parse(input.range) }))
  .handler(async ({ data }) => {
    await ensureSession()
    return await listRecentSessions({ limit: 5, ...windowUs(data.range) })
  })

const fetchSession = createServerFn({ method: 'GET' })
  .inputValidator((input: { sessionId: string; range?: unknown }) => ({
    sessionId: input.sessionId,
    range: parse(input.range),
  }))
  .handler(async ({ data }) => {
    await ensureSession()
    return await getSession(data.sessionId, windowUs(data.range))
  })

export const recentSessionsQuery = (range: TimeRange = DEFAULT) =>
  queryOptions({
    queryKey: queryKeys.sessions.recentWindow(serialize(range)),
    queryFn: () => fetchRecentSessions({ data: { range } }),
  })

export const sessionQuery = (id: string, range: TimeRange = DEFAULT) =>
  queryOptions({
    queryKey: queryKeys.sessions.detailWindow(id, serialize(range)),
    queryFn: () => fetchSession({ data: { sessionId: id, range } }),
  })
