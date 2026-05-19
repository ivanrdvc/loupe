import { StickyNote01Icon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { createFileRoute } from '@tanstack/react-router'
import { Page } from '#/components/page'
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '#/components/ui/empty'

export const Route = createFileRoute('/notes/')({
  component: NotesPage,
})

function NotesPage() {
  return (
    <Page title="Notes">
      <div className="px-4 lg:px-6">
        <Empty>
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <HugeiconsIcon icon={StickyNote01Icon} />
            </EmptyMedia>
            <EmptyTitle>Notes is coming soon</EmptyTitle>
            <EmptyDescription>Flag a session or trace with a note and it'll appear here.</EmptyDescription>
          </EmptyHeader>
        </Empty>
      </div>
    </Page>
  )
}
