import { useQuery } from '@tanstack/react-query'
import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { AUTO_REFRESH_MS } from '#/components/auto-refresh-select'
import { Page } from '#/components/page'
import { useAutoRefresh } from '#/hooks/use-auto-refresh'
import { useTimeRange } from '#/hooks/use-time-range'
import { useScopedUserId } from '#/hooks/use-user'
import { tracesQuery } from './-data'
import { TracesDataTable } from './-traces-data-table'

export const Route = createFileRoute('/traces/')({
  component: TracesIndex,
})

function TracesIndex() {
  const [range, setRange] = useTimeRange()
  const [autoRefresh, setAutoRefresh] = useAutoRefresh()
  const scopedUserId = useScopedUserId()
  const { data, isLoading, isFetching, refetch } = useQuery({
    ...tracesQuery(range, scopedUserId),
    refetchInterval: AUTO_REFRESH_MS[autoRefresh],
  })
  const traces = data?.traces ?? []
  const navigate = useNavigate()

  return (
    <Page title="Traces">
      <TracesDataTable
        data={traces}
        isLoading={isLoading}
        onRowClick={(row) => {
          void navigate({ to: '/traces/$traceId', params: { traceId: row.id } })
        }}
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
