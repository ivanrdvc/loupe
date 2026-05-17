import { ArrowTopRightOnSquareIcon, InboxIcon } from '@heroicons/react/20/solid'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { createFileRoute, Link } from '@tanstack/react-router'
import { EmptyState } from '#/components/empty-state'
import { Button } from '#/components/ui/button'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '#/components/ui/table'
import { formatAgo } from '#/lib/format'
import { queryKeys } from '#/lib/query-keys'
import { dismissInboxItemFn, inboxQuery, snoozeInboxItemFn } from './-data'

export const Route = createFileRoute('/inbox/')({
  loader: ({ context }) => context.queryClient.ensureQueryData(inboxQuery()),
  component: InboxPage,
})

function InboxPage() {
  const queryClient = useQueryClient()
  const { data: items = [] } = useQuery(inboxQuery())
  const invalidate = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: queryKeys.inbox.all() }),
      queryClient.invalidateQueries({ queryKey: queryKeys.inbox.unreadCount() }),
      queryClient.invalidateQueries({ queryKey: queryKeys.home.all() }),
    ])
  }
  const dismiss = useMutation({ mutationFn: (id: number) => dismissInboxItemFn({ data: id }), onSuccess: invalidate })
  const snooze = useMutation({ mutationFn: (id: number) => snoozeInboxItemFn({ data: id }), onSuccess: invalidate })

  return (
    <div className="flex h-full flex-col p-4">
      <header className="flex flex-wrap items-baseline gap-x-3 gap-y-1 pb-3">
        <h1 className="text-lg font-semibold tracking-tight text-foreground">Inbox</h1>
      </header>

      {items.length === 0 ? (
        <EmptyState icon={InboxIcon} title="Inbox is clear" description="No open alerts." />
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-32">Fired</TableHead>
              <TableHead>Alert</TableHead>
              <TableHead className="w-28">Kind</TableHead>
              <TableHead className="w-12" />
              <TableHead className="w-44" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.map((item) => (
              <TableRow key={item.id}>
                <TableCell className="tabular-nums text-muted-foreground">{formatAgo(item.firedAtMs)}</TableCell>
                <TableCell className="font-medium">{item.summary}</TableCell>
                <TableCell className="font-mono text-xs text-muted-foreground">{item.kind}</TableCell>
                <TableCell>
                  <OpenLink item={item} />
                </TableCell>
                <TableCell>
                  <div className="flex justify-end gap-2">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => snooze.mutate(item.id)}
                      disabled={snooze.isPending}
                    >
                      Snooze
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => dismiss.mutate(item.id)}
                      disabled={dismiss.isPending}
                    >
                      Dismiss
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  )
}

function OpenLink({ item }: { item: { sessionId?: string | null; traceId?: string | null } }) {
  const linkClass = 'inline-flex items-center text-muted-foreground hover:text-foreground'
  if (item.sessionId) {
    return (
      <Link
        to="/sessions/$sessionId"
        params={{ sessionId: item.sessionId }}
        search={{ days: 1, view: 'conversation' }}
        className={linkClass}
        aria-label="Open session"
      >
        <ArrowTopRightOnSquareIcon className="size-3.5" />
      </Link>
    )
  }
  if (item.traceId) {
    return (
      <Link to="/runs/$runId" params={{ runId: item.traceId }} className={linkClass} aria-label="Open run">
        <ArrowTopRightOnSquareIcon className="size-3.5" />
      </Link>
    )
  }
  return (
    <Link to="/sessions" search={{ days: 1 }} className={linkClass} aria-label="Open sessions">
      <ArrowTopRightOnSquareIcon className="size-3.5" />
    </Link>
  )
}
