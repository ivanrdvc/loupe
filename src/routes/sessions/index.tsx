import { useQuery } from '@tanstack/react-query'
import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { AUTO_REFRESH_MS } from '#/components/auto-refresh-select'
import { Page } from '#/components/page'
import { useAutoRefresh } from '#/hooks/use-auto-refresh'
import { useTimeRange } from '#/hooks/use-time-range'
import { useScopedUserId } from '#/hooks/use-user'
import { DataTable } from './-components/data-table'
import { useSessionSearch } from './-components/use-session-search'
import { sessionsQuery } from './-data'

export const Route = createFileRoute('/sessions/')({
  validateSearch: (search: Record<string, unknown>): { userId?: string; session?: string } => {
    const userId = typeof search.userId === 'string' ? search.userId.trim() : ''
    const session = typeof search.session === 'string' ? search.session.trim() : ''
    return {
      ...(userId ? { userId } : {}),
      ...(session ? { session } : {}),
    }
  },
  component: Sessions,
})

function Sessions() {
  const { userId: overrideUserId, session: previewSessionId } = Route.useSearch()
  const navigate = useNavigate({ from: Route.fullPath })
  const [range, setRange] = useTimeRange()
  const [autoRefresh, setAutoRefresh] = useAutoRefresh()
  const globalScopedUserId = useScopedUserId()
  const scopedUserId = overrideUserId ?? globalScopedUserId
  const { data, isLoading, isFetching, refetch } = useQuery({
    ...sessionsQuery(range, scopedUserId),
    refetchInterval: AUTO_REFRESH_MS[autoRefresh],
  })
  const sessions = data?.sessions ?? []

  useSessionSearch({
    sessions,
    onSelect: (id) => navigate({ search: (prev) => ({ ...prev, session: id }) }),
  })

  return (
    <Page title="Sessions">
      <DataTable
        data={sessions}
        isLoading={isLoading}
        onRowClick={(row) => navigate({ search: (prev) => ({ ...prev, session: row.sessionId }) })}
        rowClassName={(row) => (row.sessionId === previewSessionId ? 'bg-muted' : undefined)}
        range={range}
        onRangeChange={setRange}
        autoRefresh={autoRefresh}
        onAutoRefreshChange={setAutoRefresh}
        onRefresh={() => {
          void refetch()
        }}
        refreshing={isFetching}
      />
    </Page>
  )
}
