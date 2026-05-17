import { PlayCircleIcon } from '@heroicons/react/24/outline'
import { createFileRoute } from '@tanstack/react-router'
import { Page } from '#/components/page'
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '#/components/ui/empty'

export const Route = createFileRoute('/runs/')({
  component: RunsLanding,
})

function RunsLanding() {
  return (
    <Page title="Runs">
      <div className="px-4 lg:px-6">
        <Empty>
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <PlayCircleIcon />
            </EmptyMedia>
            <EmptyTitle>Nothing running yet</EmptyTitle>
            <EmptyDescription>
              This section is for single-run views and future live ingestion — watching spans flush from the exporter,
              streaming events from a running app, or starting an agent here. Conversation threads and multi-run
              grouping live under <a href="/sessions">Sessions</a>.
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      </div>
    </Page>
  )
}
