import { queryOptions } from '@tanstack/react-query'
import { createServerFn } from '@tanstack/react-start'
import { ensureSession, requireCan } from '#/lib/auth/guards'
import { queryKeys, STALE_TELEMETRY_MS } from '#/lib/query-keys'
import {
  countOpenInboxItems,
  dismissAllOpenInboxItems,
  dismissInboxItem,
  listOpenInboxItems,
  snoozeInboxItem,
} from './server'

const fetchInbox = createServerFn({ method: 'GET' }).handler(async () => {
  await ensureSession()
  return listOpenInboxItems()
})

const fetchInboxUnreadCount = createServerFn({ method: 'GET' }).handler(async () => {
  await ensureSession()
  return countOpenInboxItems()
})

export const dismissAllInboxFn = createServerFn({ method: 'POST' }).handler(async () => {
  await requireCan('write', 'inbox')
  await dismissAllOpenInboxItems()
})

export const dismissInboxItemFn = createServerFn({ method: 'POST' })
  .inputValidator((id: number) => id)
  .handler(async ({ data }) => {
    await requireCan('write', 'inbox')
    await dismissInboxItem(data)
  })

export const snoozeInboxItemFn = createServerFn({ method: 'POST' })
  .inputValidator((id: number) => id)
  .handler(async ({ data }) => {
    await requireCan('write', 'inbox')
    await snoozeInboxItem(data, new Date(Date.now() + 24 * 60 * 60 * 1000))
  })

export const openInboxQuery = () =>
  queryOptions({
    queryKey: queryKeys.inbox.open(),
    queryFn: () => fetchInbox(),
    staleTime: STALE_TELEMETRY_MS,
    refetchInterval: STALE_TELEMETRY_MS,
  })

export const inboxUnreadCountQuery = () =>
  queryOptions({
    queryKey: queryKeys.inbox.unreadCount(),
    queryFn: () => fetchInboxUnreadCount(),
    staleTime: STALE_TELEMETRY_MS,
    refetchInterval: STALE_TELEMETRY_MS,
  })
