import type { InboxRow } from '#/features/inbox/server'

export function inboxItemTraceLink(item: Pick<InboxRow, 'traceId'>) {
  return item.traceId ? ({ to: '/traces/$traceId', params: { traceId: item.traceId } } as const) : null
}
