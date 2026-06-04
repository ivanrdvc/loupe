import { BellIcon } from '@heroicons/react/24/outline'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { RelativeTime } from '#/components/relative-time'
import { Button } from '#/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '#/components/ui/popover'
import { ScrollArea } from '#/components/ui/scroll-area'
import { queryKeys } from '#/lib/query-keys'
import { dismissAllInboxFn, inboxUnreadCountQuery, openInboxQuery } from '#/routes/inbox/-data'
import { inboxItemTraceLink } from '#/routes/inbox/-meta'
import type { InboxRow } from '#/server/inbox'

const MAX_VISIBLE = 8

export function NotificationBell() {
  const queryClient = useQueryClient()
  const { data: count = 0 } = useQuery(inboxUnreadCountQuery())
  const { data: open = [] } = useQuery(openInboxQuery())

  const invalidate = () => queryClient.invalidateQueries({ queryKey: queryKeys.inbox.all() })
  const dismissAll = useMutation({ mutationFn: () => dismissAllInboxFn(), onSuccess: invalidate })

  const items = open.slice(0, MAX_VISIBLE)
  const more = Math.max(0, open.length - MAX_VISIBLE)

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
      <PopoverContent align="end" className="w-88 p-0">
        <div className="flex items-center justify-between px-3 pt-3 pb-2">
          <span className="text-sm font-medium">Notifications</span>
          {count > 0 && (
            <Button
              variant="link"
              onClick={() => dismissAll.mutate()}
              disabled={dismissAll.isPending}
              className="h-auto p-0 text-xs font-normal text-muted-foreground hover:text-foreground"
            >
              Dismiss all
            </Button>
          )}
        </div>

        {items.length === 0 ? (
          <div className="px-3 py-8 text-center text-xs text-muted-foreground">{"You're all caught up."}</div>
        ) : (
          <ScrollArea className="[&>[data-slot=scroll-area-viewport]]:max-h-80">
            <ul className="px-3 py-0.5">
              {items.map((item) => (
                <NotificationItem key={item.id} item={item} />
              ))}
            </ul>
          </ScrollArea>
        )}

        <div className="border-t px-3 py-2">
          <Button variant="outline" className="w-full" asChild>
            <Link to="/inbox">{more > 0 ? `View all (${more} more)` : 'View all'}</Link>
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  )
}

function NotificationItem({ item }: { item: InboxRow }) {
  const inner = (
    <div className="border-b py-2.5 last:border-b-0">
      <p className="text-xs leading-snug text-foreground">{item.summary}</p>
      <RelativeTime ts={item.firedAtMs} className="mt-0.5 block text-[11px] text-muted-foreground tabular-nums" />
    </div>
  )
  const link = inboxItemTraceLink(item)
  if (!link) return <li>{inner}</li>
  return (
    <li>
      <Link {...link} className="-mx-2 block rounded-md px-2 transition-colors hover:bg-muted/60">
        {inner}
      </Link>
    </li>
  )
}
