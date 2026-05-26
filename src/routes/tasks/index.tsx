import { useQuery } from '@tanstack/react-query'
import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { useMemo } from 'react'
import { AUTO_REFRESH_MS } from '#/components/auto-refresh-select'
import { Page } from '#/components/page'
import { useAutoRefresh } from '#/hooks/use-auto-refresh'
import { useTimeRange } from '#/hooks/use-time-range'
import { useScopedUserId } from '#/hooks/use-user'
import { rollupTasks, summarizeRollup } from '#/lib/tasks/rollup'
import { windowMs } from '#/lib/time-range'
import { MetricTiles } from './-components/metric-tiles'
import { TasksDataTable } from './-components/tasks-table'
import { tasksTracesQuery } from './-data'

export const Route = createFileRoute('/tasks/')({
  validateSearch: (search: Record<string, unknown>): { trace?: string; session?: string } => {
    const trace = typeof search.trace === 'string' ? search.trace.trim() : ''
    const session = typeof search.session === 'string' ? search.session.trim() : ''
    return {
      ...(trace ? { trace } : {}),
      ...(session ? { session } : {}),
    }
  },
  component: TasksPage,
})

function TasksPage() {
  const navigate = useNavigate()
  const [range, setRange] = useTimeRange()
  const [autoRefresh, setAutoRefresh] = useAutoRefresh()
  const scopedUserId = useScopedUserId()

  const { data, isLoading, isFetching, refetch } = useQuery({
    ...tasksTracesQuery(range, scopedUserId),
    refetchInterval: AUTO_REFRESH_MS[autoRefresh],
  })

  const rows = useMemo(() => {
    if (!data?.traces) return []
    const { from, to } = windowMs(range)
    return rollupTasks(data.traces, { fromMs: from, toMs: to })
  }, [data?.traces, range])

  const summary = useMemo(() => summarizeRollup(rows), [rows])

  return (
    <Page title="Tasks">
      <MetricTiles summary={summary} />
      <TasksDataTable
        data={rows}
        isLoading={isLoading}
        onRowClick={(row) => {
          void navigate({ to: '/tasks/$taskKey', params: { taskKey: encodeURIComponent(row.key) } })
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
