import { useQuery } from '@tanstack/react-query'
import { createFileRoute } from '@tanstack/react-router'
import { useState } from 'react'
import { Page } from '#/components/page'
import { DataTable } from './-components/data-table'
import { SessionsDrawerHost } from './-components/sessions-drawer-host'
import { sessionsQuery } from './-data'

export const Route = createFileRoute('/sessions/')({
  loader: ({ context }) => context.queryClient.ensureQueryData(sessionsQuery(7)),
  component: Sessions,
})

function Sessions() {
  const { data, isLoading } = useQuery(sessionsQuery(7))
  const sessions = data?.sessions ?? []
  const [previewSessionId, setPreviewSessionId] = useState<string | null>(null)

  return (
    <Page title="Sessions">
      <DataTable
        data={sessions}
        isLoading={isLoading}
        onRowClick={(row) => setPreviewSessionId(row.sessionId)}
        rowClassName={(row) => (row.sessionId === previewSessionId ? 'bg-muted' : undefined)}
      />
      <SessionsDrawerHost previewSessionId={previewSessionId} days={7} onClose={() => setPreviewSessionId(null)} />
    </Page>
  )
}
