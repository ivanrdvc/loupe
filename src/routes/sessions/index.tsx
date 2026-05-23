import { useQuery } from '@tanstack/react-query'
import { createFileRoute } from '@tanstack/react-router'
import { useState } from 'react'
import { AUTO_REFRESH_MS } from '#/components/auto-refresh-select'
import { Page } from '#/components/page'
import { useAutoRefresh } from '#/hooks/use-auto-refresh'
import { useEnv } from '#/hooks/use-env'
import { useTimeRange } from '#/hooks/use-time-range'
import { useScopedUserId } from '#/hooks/use-user'
import { DataTable } from './-components/data-table'
import { SessionsDrawerHost } from './-components/sessions-drawer-host'
import { useSessionSearch } from './-components/use-session-search'
import { sessionsQuery } from './-data'

export const Route = createFileRoute('/sessions/')({
  validateSearch: (search: Record<string, unknown>): { userId?: string } => {
    const raw = typeof search.userId === 'string' ? search.userId.trim() : ''
    return raw ? { userId: raw } : {}
  },
  component: Sessions,
})

function Sessions() {
  const { userId: overrideUserId } = Route.useSearch()
  const [env, setEnv] = useEnv()
  const [range, setRange] = useTimeRange()
  const [autoRefresh, setAutoRefresh] = useAutoRefresh()
  const globalScopedUserId = useScopedUserId()
  const scopedUserId = overrideUserId ?? globalScopedUserId
  const { data, isLoading, isFetching, refetch } = useQuery({
    ...sessionsQuery(range, scopedUserId),
    refetchInterval: AUTO_REFRESH_MS[autoRefresh],
  })
  const sessions = data?.sessions ?? []
  const [previewSessionId, setPreviewSessionId] = useState<string | null>(null)

  useSessionSearch({ sessions, onSelect: setPreviewSessionId })

  return (
    <Page title="Sessions">
      <DataTable
        data={sessions}
        isLoading={isLoading}
        onRowClick={(row) => setPreviewSessionId(row.sessionId)}
        rowClassName={(row) => (row.sessionId === previewSessionId ? 'bg-muted' : undefined)}
        env={env}
        onEnvChange={setEnv}
        range={range}
        onRangeChange={setRange}
        autoRefresh={autoRefresh}
        onAutoRefreshChange={setAutoRefresh}
        onRefresh={() => {
          void refetch()
        }}
        refreshing={isFetching}
      />
      <SessionsDrawerHost previewSessionId={previewSessionId} range={range} onClose={() => setPreviewSessionId(null)} />
    </Page>
  )
}
