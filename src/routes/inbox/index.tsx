import { ArrowTopRightOnSquareIcon, InboxIcon } from '@heroicons/react/20/solid'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { createFileRoute } from '@tanstack/react-router'
import { EmptyState } from '#/components/empty-state'
import { Button } from '#/components/ui/catalyst/button'
import { Link } from '#/components/ui/catalyst/link'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '#/components/ui/catalyst/table'
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
    <div className="flex h-full flex-col">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 pb-4">
        <h1 className="text-lg font-semibold tracking-tight text-zinc-950 dark:text-white">Inbox</h1>
      </div>

      {items.length === 0 ? (
        <div className="overflow-hidden rounded-xl border border-zinc-950/5 bg-white dark:border-white/8 dark:bg-zinc-900">
          <EmptyState icon={InboxIcon} title="Inbox is clear" description="No open alerts." />
        </div>
      ) : (
        <Table dense>
          <TableHead>
            <TableRow>
              <TableHeader className="w-32">Fired</TableHeader>
              <TableHeader>Alert</TableHeader>
              <TableHeader className="w-28">Kind</TableHeader>
              <TableHeader className="w-16" />
              <TableHeader className="w-44" />
            </TableRow>
          </TableHead>
          <TableBody>
            {items.map((item) => (
              <TableRow key={item.id}>
                <TableCell className="tabular-nums text-zinc-500 dark:text-zinc-400">
                  {formatAgo(item.firedAtMs)}
                </TableCell>
                <TableCell className="font-medium">{item.summary}</TableCell>
                <TableCell className="font-mono text-xs text-zinc-500 dark:text-zinc-400">{item.kind}</TableCell>
                <TableCell>
                  <OpenLink
                    href={
                      item.sessionId
                        ? `/sessions/${item.sessionId}`
                        : item.traceId
                          ? `/runs/${item.traceId}`
                          : '/sessions'
                    }
                  />
                </TableCell>
                <TableCell>
                  <div className="flex justify-end gap-2">
                    <Button plain onClick={() => snooze.mutate(item.id)} disabled={snooze.isPending}>
                      Snooze
                    </Button>
                    <Button plain onClick={() => dismiss.mutate(item.id)} disabled={dismiss.isPending}>
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

function OpenLink({ href }: { href: string }) {
  return (
    <Link
      href={href}
      className="inline-flex items-center text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200"
      aria-label="Open"
    >
      <ArrowTopRightOnSquareIcon className="size-3.5" />
    </Link>
  )
}
