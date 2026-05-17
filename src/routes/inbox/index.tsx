import { InboxIcon } from '@heroicons/react/20/solid'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { createFileRoute } from '@tanstack/react-router'
import { Page } from '#/components/page'
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '#/components/ui/empty'
import { queryKeys } from '#/lib/query-keys'
import { InboxDataTable } from './-components/data-table'
import { dismissInboxItemFn, inboxQuery, snoozeInboxItemFn } from './-data'

export const Route = createFileRoute('/inbox/')({
  loader: ({ context }) => context.queryClient.ensureQueryData(inboxQuery()),
  component: InboxPage,
})

function InboxPage() {
  const queryClient = useQueryClient()
  const { data: items = [], isLoading } = useQuery(inboxQuery())
  const invalidate = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: queryKeys.inbox.all() }),
      queryClient.invalidateQueries({ queryKey: queryKeys.inbox.unreadCount() }),
      queryClient.invalidateQueries({ queryKey: queryKeys.home.all() }),
    ])
  }
  const dismiss = useMutation({ mutationFn: (id: number) => dismissInboxItemFn({ data: id }), onSuccess: invalidate })
  const snooze = useMutation({ mutationFn: (id: number) => snoozeInboxItemFn({ data: id }), onSuccess: invalidate })

  if (!isLoading && items.length === 0) {
    return (
      <Page title="Inbox">
        <div className="px-4 lg:px-6">
          <Empty>
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <InboxIcon />
              </EmptyMedia>
              <EmptyTitle>Inbox is clear</EmptyTitle>
              <EmptyDescription>No open alerts.</EmptyDescription>
            </EmptyHeader>
          </Empty>
        </div>
      </Page>
    )
  }

  return (
    <Page title="Inbox">
      <InboxDataTable
        data={items}
        isLoading={isLoading}
        onSnooze={(id) => snooze.mutate(id)}
        onDismiss={(id) => dismiss.mutate(id)}
        snoozePending={snooze.isPending}
        dismissPending={dismiss.isPending}
      />
    </Page>
  )
}
