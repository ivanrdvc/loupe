import { BellIcon } from '@heroicons/react/24/outline'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { useState } from 'react'
import { RelativeTime } from '#/components/relative-time'
import { Button } from '#/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '#/components/ui/popover'
import { Tabs, TabsList, TabsTrigger } from '#/components/ui/tabs'
import { queryKeys } from '#/lib/query-keys'
import { cn } from '#/lib/utils'
import { inboxQuery, inboxUnreadCountQuery, markAllInboxReadFn, recentInboxQuery } from '#/routes/inbox/-data'
import type { InboxRow } from '#/server/inbox'

export function NotificationBell() {
  const queryClient = useQueryClient()
  const [tab, setTab] = useState<'unread' | 'all'>('unread')
  const { data: count = 0 } = useQuery(inboxUnreadCountQuery())
  const { data: unread = [] } = useQuery(inboxQuery())
  const { data: all = [] } = useQuery(recentInboxQuery())

  const invalidate = () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: queryKeys.inbox.all() }),
      queryClient.invalidateQueries({ queryKey: queryKeys.inbox.recent() }),
      queryClient.invalidateQueries({ queryKey: queryKeys.inbox.unreadCount() }),
      queryClient.invalidateQueries({ queryKey: queryKeys.home.all() }),
    ])
  const markRead = useMutation({ mutationFn: () => markAllInboxReadFn(), onSuccess: invalidate })

  const items = tab === 'unread' ? unread : all
  const unreadIds = new Set(unread.map((i) => i.id))

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="relative size-8 rounded-full text-muted-foreground hover:text-foreground"
          aria-label={count > 0 ? `Notifications (${count} unread)` : 'Notifications'}
        >
          <BellIcon className="size-4.5" />
          {count > 0 && (
            <span className="absolute top-1.5 right-1.5 size-2 rounded-full bg-primary ring-2 ring-background" />
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="flex max-h-[28rem] w-88 flex-col gap-0 overflow-hidden p-0">
        <div className="flex shrink-0 items-center justify-between px-3 pt-3 pb-2">
          <span className="text-sm font-medium">Notifications</span>
          {count > 0 && (
            <button
              type="button"
              onClick={() => markRead.mutate()}
              disabled={markRead.isPending}
              className="text-xs text-muted-foreground transition-colors hover:text-foreground disabled:opacity-50"
            >
              Mark {count} as read
            </button>
          )}
        </div>

        <div className="shrink-0 px-3">
          <Tabs value={tab} onValueChange={(v) => setTab(v as 'unread' | 'all')}>
            <TabsList className="w-full">
              <TabsTrigger value="unread" className="flex-1">
                Unread
              </TabsTrigger>
              <TabsTrigger value="all" className="flex-1">
                All
              </TabsTrigger>
            </TabsList>
          </Tabs>
        </div>

        {items.length === 0 ? (
          <div className="px-3 py-8 text-center text-xs text-muted-foreground">
            {tab === 'unread' ? "You're all caught up." : 'No notifications.'}
          </div>
        ) : (
          <ul className="min-h-0 flex-1 overflow-y-auto px-3 py-0.5">
            {items.map((item) => (
              <NotificationItem key={item.id} item={item} unread={unreadIds.has(item.id)} />
            ))}
          </ul>
        )}

        <div className="shrink-0 border-t p-2">
          <Button variant="outline" className="w-full" asChild>
            <Link to="/inbox">View all</Link>
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  )
}

function NotificationItem({ item, unread }: { item: InboxRow; unread: boolean }) {
  const inner = (
    <div className="flex gap-2.5 border-b py-2.5 last:border-b-0">
      <span
        className={cn(
          'mt-1 size-1.5 shrink-0 rounded-full',
          unread ? 'bg-primary' : 'bg-transparent ring-1 ring-border',
        )}
        aria-hidden
      />
      <div className="min-w-0 flex-1">
        <p className={cn('text-xs leading-snug', unread ? 'text-foreground' : 'text-muted-foreground')}>
          {item.summary}
        </p>
        <RelativeTime ts={item.firedAtMs} className="mt-0.5 block text-[11px] text-muted-foreground tabular-nums" />
      </div>
    </div>
  )

  const to = item.sessionId
    ? {
        to: '/sessions/$sessionId' as const,
        params: { sessionId: item.sessionId },
        search: { range: 1, view: 'conversation' as const },
      }
    : item.traceId
      ? { to: '/traces/$traceId' as const, params: { traceId: item.traceId } }
      : null

  if (!to) return <li>{inner}</li>
  return (
    <li>
      <Link {...to} className="-mx-2 block rounded-md px-2 transition-colors hover:bg-muted/60">
        {inner}
      </Link>
    </li>
  )
}
