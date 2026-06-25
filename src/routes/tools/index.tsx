import { useQuery } from '@tanstack/react-query'
import { createFileRoute, useNavigate } from '@tanstack/react-router'
import type { SortingState } from '@tanstack/react-table'
import { useMemo, useState } from 'react'
import { Page } from '#/components/page'
import { toolsCatalogQuery } from '#/features/inspect'
import { useTimeRange } from '#/hooks/use-time-range'
import type { ToolDimensionFilter } from '#/lib/telemetry'
import { TOOL_DIMENSIONS } from '#/lib/telemetry/conventions'
import { ToolsDataTable } from './-tools-data-table'

const SORTABLE_COLUMNS = new Set([
  'name',
  'calls',
  'errorRate',
  'p95Ms',
  'avgTokensEst',
  'p95TokensEst',
  'maxTokens',
  'totalTokensEst',
  'lastSeenMs',
])

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
  const [dimValues, setDimValues] = useState<Record<string, string>>({})

  const dimensions: ToolDimensionFilter[] = useMemo(
    () =>
      TOOL_DIMENSIONS.flatMap((d) => {
        const value = dimValues[d.key]?.trim()
        return value ? [{ field: d.field, value }] : []
      }),
    [dimValues],
  )

  const { data, isLoading } = useQuery(toolsCatalogQuery(range, dimensions))

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
        onRowClick={(row) => navigate({ search: (prev) => ({ ...prev, tool: row.name }) })}
        range={range}
        onRangeChange={setRange}
        dimensions={dimValues}
        onDimensionChange={(key, value) => setDimValues((prev) => ({ ...prev, [key]: value }))}
      />
    </Page>
  )
}
