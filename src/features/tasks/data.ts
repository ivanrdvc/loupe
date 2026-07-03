import { queryOptions } from '@tanstack/react-query'
import { createServerFn } from '@tanstack/react-start'
import { ensureSession } from '#/lib/auth/guards'
import { queryKeys, STALE_LIVE_MS } from '#/lib/query-keys'
import { listRecentTraces, listTaskRollup } from '#/lib/telemetry'
import { FIRE_TRIGGER_TYPES } from '#/lib/telemetry/trace-category'
import { parseRangeUserInput, serialize, type TimeRange, windowUs } from '#/lib/time-range'

// List page: the provider groups fire traces by task identity in SQL.
const fetchTaskRollup = createServerFn({ method: 'GET' })
  .inputValidator(parseRangeUserInput)
  .handler(async ({ data }) => {
    await ensureSession()
    return await listTaskRollup({
      ...windowUs(data.range),
      ...(data.userId ? { userId: data.userId } : {}),
    })
  })

export const tasksRollupQuery = (range: TimeRange, userId = '') =>
  queryOptions({
    queryKey: [...queryKeys.tasks.window(serialize(range), userId), 'rollup'] as const,
    queryFn: () => fetchTaskRollup({ data: { range, userId } }),
    staleTime: STALE_LIVE_MS,
  })

const parseFiresInput = (input: unknown) => {
  const raw = (input ?? {}) as Record<string, unknown>
  const taskKey = typeof raw.taskKey === 'string' ? raw.taskKey : ''
  return { ...parseRangeUserInput(raw), taskKey }
}

// Detail page: only the selected task's fire traces (taskKey WHERE, not a
// 500-row superset re-filtered in JS).
const fetchTaskFires = createServerFn({ method: 'GET' })
  .inputValidator(parseFiresInput)
  .handler(async ({ data }) => {
    await ensureSession()
    return await listRecentTraces({
      limit: 500,
      triggerTypes: FIRE_TRIGGER_TYPES,
      ...(data.taskKey ? { taskKey: data.taskKey } : {}),
      ...windowUs(data.range),
      ...(data.userId ? { userId: data.userId } : {}),
    })
  })

export const taskFiresQuery = (range: TimeRange, taskKey: string, userId = '') =>
  queryOptions({
    queryKey: [...queryKeys.tasks.window(serialize(range), userId), 'fires', taskKey] as const,
    queryFn: () => fetchTaskFires({ data: { range, userId, taskKey } }),
    staleTime: STALE_LIVE_MS,
  })
