import { useQuery } from '@tanstack/react-query'
import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { AUTO_REFRESH_MS } from '#/components/auto-refresh-select'
import { Page } from '#/components/page'
import { useAutoRefresh } from '#/hooks/use-auto-refresh'
import { useTimeRange } from '#/hooks/use-time-range'
import { useScopedUserId } from '#/hooks/use-user'
import { DataTable } from './-components/data-table'
import { HostFilter } from './-components/host-filter'
import { useSessionSearch } from './-components/use-session-search'
import { sessionsQuery } from './-data'

export const Route = createFileRoute('/sessions/')({
  validateSearch: (
    search: Record<string, unknown>,
  ): { userId?: string; host?: string; session?: string; trace?: string } => {
    const userId = typeof search.userId === 'string' ? search.userId.trim() : ''
    const host = typeof search.host === 'string' ? search.host.trim() : ''
    const session = typeof search.session === 'string' ? search.session.trim() : ''
    const trace = typeof search.trace === 'string' ? search.trace.trim() : ''
    return {
      ...(userId ? { userId } : {}),
      ...(host ? { host } : {}),
      ...(session ? { session } : {}),
      ...(trace ? { trace } : {}),
    }
  },
  component: Sessions,
})

function Sessions() {
  const { userId: overrideUserId, host = '', session: previewSessionId } = Route.useSearch()
  const navigate = useNavigate({ from: Route.fullPath })
  const [range, setRange] = useTimeRange()
  const [autoRefresh, setAutoRefresh] = useAutoRefresh()
  const globalScopedUserId = useScopedUserId()
  const scopedUserId = overrideUserId ?? globalScopedUserId
  const { data, isLoading, isFetching, refetch } = useQuery({
    ...sessionsQuery(range, scopedUserId, host),
    refetchInterval: AUTO_REFRESH_MS[autoRefresh],
  })
  const sessions = data?.sessions ?? []
  const hosts = [...new Set(sessions.map((s) => s.host).filter((h): h is string => !!h))].sort()

  useSessionSearch({
    sessions,
    onSelect: (id) => navigate({ search: (prev) => ({ ...prev, session: id }) }),
  })

  return (
    <Page title="Sessions">
      <DataTable
        data={sessions}
        isLoading={isLoading}
        extraFilters={
          <HostFilter
            value={host}
            hosts={hosts}
            onChange={(h) => navigate({ search: (prev) => ({ ...prev, host: h || undefined }) })}
          />
        }
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
