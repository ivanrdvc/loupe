import { InboxIcon } from '@heroicons/react/20/solid'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { createFileRoute } from '@tanstack/react-router'
import { Page } from '#/components/page'
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '#/components/ui/empty'
import { queryKeys } from '#/lib/query-keys'
import { InboxDataTable } from './-components/data-table'
import { dismissInboxItemFn, inboxUnreadCountQuery, openInboxQuery, snoozeInboxItemFn } from './-data'

export const Route = createFileRoute('/inbox/')({
  loader: ({ context }) => context.queryClient.ensureQueryData(openInboxQuery()),
  component: InboxPage,
})

function InboxPage() {
  const queryClient = useQueryClient()
  const { data: items = [], isLoading } = useQuery(openInboxQuery())

  const optimisticRemove = (id: number) => {
    queryClient.setQueryData(openInboxQuery().queryKey, (rows) => rows?.filter((row) => row.id !== id))
    queryClient.setQueryData(inboxUnreadCountQuery().queryKey, (n) => Math.max(0, (n ?? 1) - 1))
  }
  const settle = () => queryClient.invalidateQueries({ queryKey: queryKeys.inbox.all() })
  const dismiss = useMutation({
    mutationFn: (id: number) => dismissInboxItemFn({ data: id }),
    onMutate: optimisticRemove,
    onSettled: settle,
  })
  const snooze = useMutation({
    mutationFn: (id: number) => snoozeInboxItemFn({ data: id }),
    onMutate: optimisticRemove,
    onSettled: settle,
  })

  if (!isLoading && items.length === 0) {
    return (
      <Page title="Inbox">
        <div className="px-4 lg:px-6">
          <Empty>
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <InboxIcon />
              </EmptyMedia>
              <EmptyTitle>No notifications</EmptyTitle>
              <EmptyDescription>Nothing here yet.</EmptyDescription>
            </EmptyHeader>
          </Empty>
        </div>
      </Page>
    )
  }

  return (
    <Page title="Inbox">
      <InboxDataTable data={items} isLoading={isLoading} onSnooze={snooze.mutate} onDismiss={dismiss.mutate} />
    </Page>
  )
}
