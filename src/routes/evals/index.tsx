import { BeakerIcon } from '@heroicons/react/24/outline'
import { createFileRoute } from '@tanstack/react-router'
import { Page } from '#/components/page'
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '#/components/ui/empty'

export const Route = createFileRoute('/evals/')({
  component: EvalsPage,
})

function EvalsPage() {
  return (
    <Page title="Evals">
      <div className="px-4 lg:px-6">
        <Empty>
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <BeakerIcon />
            </EmptyMedia>
            <EmptyTitle>No evals yet</EmptyTitle>
            <EmptyDescription>
              Push results to{' '}
              <code className="rounded bg-muted px-1 py-0.5 font-mono text-[11px] text-foreground">
                POST /api/evals/ingest
              </code>{' '}
              from your CI, SDK, or GitHub Action.
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      </div>
    </Page>
  )
}
