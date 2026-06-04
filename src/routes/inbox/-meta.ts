import type { InboxRow } from '#/server/inbox'

export function inboxItemTraceLink(item: Pick<InboxRow, 'traceId'>) {
  return item.traceId ? ({ to: '/traces/$traceId', params: { traceId: item.traceId } } as const) : null
}
