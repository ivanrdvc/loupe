import { ClipboardDocumentListIcon } from '@heroicons/react/24/outline'
import { createFileRoute } from '@tanstack/react-router'
import { Page } from '#/components/page'
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '#/components/ui/empty'

export const Route = createFileRoute('/tasks/')({
  component: TasksPage,
})

function TasksPage() {
  return (
    <Page title="Tasks">
      <div className="px-4 lg:px-6">
        <Empty>
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <ClipboardDocumentListIcon />
            </EmptyMedia>
            <EmptyTitle>No tasks yet</EmptyTitle>
            <EmptyDescription>Tasks will show up here once you create them.</EmptyDescription>
          </EmptyHeader>
        </Empty>
      </div>
    </Page>
  )
}
