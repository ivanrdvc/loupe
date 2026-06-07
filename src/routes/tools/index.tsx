import { useQuery } from '@tanstack/react-query'
import { createFileRoute, useNavigate } from '@tanstack/react-router'
import type { SortingState } from '@tanstack/react-table'
import { useMemo } from 'react'
import { AUTO_REFRESH_MS } from '#/components/auto-refresh-select'
import { Page } from '#/components/page'
import { toolsCatalogQuery } from '#/features/inspect'
import { useAutoRefresh } from '#/hooks/use-auto-refresh'
import { useTimeRange } from '#/hooks/use-time-range'
import { ToolsDataTable } from './-tools-data-table'

const SORTABLE_COLUMNS = new Set(['name', 'calls', 'errorRate', 'p50Ms', 'p95Ms', 'avgChars', 'p95Chars', 'lastSeenMs'])

export const Route = createFileRoute('/tools/')({
  validateSearch: (search: Record<string, unknown>): { sort?: string; desc?: boolean; tool?: string } => {
    const sort = typeof search.sort === 'string' && SORTABLE_COLUMNS.has(search.sort) ? search.sort : undefined
    const desc = typeof search.desc === 'boolean' ? search.desc : undefined
    const tool = typeof search.tool === 'string' ? search.tool.trim() : ''
    return {
      ...(sort ? { sort } : {}),
      ...(desc !== undefined ? { desc } : {}),
      ...(tool ? { tool } : {}),
    }
  },
  loader: ({ context }) => context.queryClient.ensureQueryData(toolsCatalogQuery()),
  component: ToolsPage,
})

function ToolsPage() {
  const { sort, desc } = Route.useSearch()
  const navigate = useNavigate({ from: Route.fullPath })
  const [range, setRange] = useTimeRange()
  const [autoRefresh, setAutoRefresh] = useAutoRefresh()
  const { data, isLoading, isFetching, refetch } = useQuery({
    ...toolsCatalogQuery(range),
    refetchInterval: AUTO_REFRESH_MS[autoRefresh],
  })

  const sorting: SortingState = useMemo(
    () => (sort ? [{ id: sort, desc: desc ?? true }] : [{ id: 'calls', desc: true }]),
    [sort, desc],
  )

  const setSorting = (next: SortingState) => {
    const first = next[0]
    void navigate({
      search: (prev) => ({
        ...prev,
        sort: first?.id,
        desc: first ? first.desc : undefined,
      }),
      replace: true,
    })
  }

  return (
    <Page title="Tools">
      <ToolsDataTable
        data={data ?? []}
        isLoading={isLoading}
        sorting={sorting}
        onSortingChange={setSorting}
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
