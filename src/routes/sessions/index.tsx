import { useQuery } from '@tanstack/react-query'
import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { AUTO_REFRESH_MS } from '#/components/auto-refresh-select'
import { Page } from '#/components/page'
import { useAutoRefresh } from '#/hooks/use-auto-refresh'
import { useTimeRange } from '#/hooks/use-time-range'
import { DataTable } from './-components/data-table'
import { HostFilter } from './-components/host-filter'
import { useSessionSearch } from './-components/use-session-search'
import { sessionHostsQuery, sessionsQuery } from './-data'

export const Route = createFileRoute('/sessions/')({
  validateSearch: (
    search: Record<string, unknown>,
  ): { userId?: string; host?: string; session?: string; trace?: string; page?: number } => {
    const userId = typeof search.userId === 'string' ? search.userId.trim() : ''
    const host = typeof search.host === 'string' ? search.host.trim() : ''
    const session = typeof search.session === 'string' ? search.session.trim() : ''
    const trace = typeof search.trace === 'string' ? search.trace.trim() : ''
    const page = Math.max(0, Math.floor(Number(search.page) || 0))
    return {
      ...(userId ? { userId } : {}),
      ...(host ? { host } : {}),
      ...(session ? { session } : {}),
      ...(trace ? { trace } : {}),
      ...(page ? { page } : {}),
    }
  },
  component: Sessions,
})

function Sessions() {
  const { userId: overrideUserId, host = '', session: previewSessionId, page = 0 } = Route.useSearch()
  const navigate = useNavigate({ from: Route.fullPath })
  const [range, setRangeRaw] = useTimeRange()
  const [autoRefresh, setAutoRefresh] = useAutoRefresh()

  // Range/filter changes invalidate the page offset — snap back to page 0.
  const setRange = (r: typeof range) => {
    setRangeRaw(r)
    void navigate({ search: (prev) => ({ ...prev, page: undefined }) })
  }
  const { data, isLoading, isFetching, refetch } = useQuery({
    ...sessionsQuery(range, overrideUserId ?? '', host, page),
    refetchInterval: AUTO_REFRESH_MS[autoRefresh],
  })
  const sessions = data?.sessions ?? []
  const { data: hosts = [] } = useQuery(sessionHostsQuery(range))

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
            onChange={(h) => navigate({ search: (prev) => ({ ...prev, host: h || undefined, page: undefined }) })}
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
        serverPagination={{
          pageIndex: page,
          hasMore: data?.hasMore ?? false,
          onPageChange: (p) => navigate({ search: (prev) => ({ ...prev, page: p || undefined }) }),
        }}
      />
    </Page>
  )
}
