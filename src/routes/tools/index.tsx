import { useQuery, useQueryClient } from '@tanstack/react-query'
import { createFileRoute, useNavigate } from '@tanstack/react-router'
import type { SortingState } from '@tanstack/react-table'
import { useMemo, useState } from 'react'
import { Page } from '#/components/page'
import { type ToolSort, toolsCatalogQuery, toolsPageQuery } from '#/features/inspect'
import { mergeSignalsByName } from '#/features/mcp'
import { useTimeRange } from '#/hooks/use-time-range'
import type { ToolDimensionFilter, ToolRow, ToolSortColumn } from '#/lib/telemetry'
import { TOOL_DIMENSIONS } from '#/lib/telemetry/conventions'
import { toolSignalsQuery } from './-signals'
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
  validateSearch: (
    search: Record<string, unknown>,
  ): { sort?: string; desc?: boolean; tool?: string; page?: number } => {
    const sort = typeof search.sort === 'string' && SORTABLE_COLUMNS.has(search.sort) ? search.sort : undefined
    const desc = typeof search.desc === 'boolean' ? search.desc : undefined
    const tool = typeof search.tool === 'string' ? search.tool.trim() : ''
    const page = Math.max(0, Math.floor(Number(search.page) || 0))
    return {
      ...(sort ? { sort } : {}),
      ...(desc !== undefined ? { desc } : {}),
      ...(tool ? { tool } : {}),
      ...(page ? { page } : {}),
    }
  },
  loader: ({ context }) => context.queryClient.ensureQueryData(toolsPageQuery()),
  component: ToolsPage,
})

function ToolsPage() {
  const { sort, desc, page = 0 } = Route.useSearch()
  const navigate = useNavigate({ from: Route.fullPath })
  const queryClient = useQueryClient()
  const [range, setRangeRaw] = useTimeRange()
  const [dimValues, setDimValues] = useState<Record<string, string>>({})

  const dimensions: ToolDimensionFilter[] = useMemo(
    () =>
      TOOL_DIMENSIONS.flatMap((d) => {
        const value = dimValues[d.key]?.trim()
        return value ? [{ field: d.field, value }] : []
      }),
    [dimValues],
  )

  // Sorting is server-side: the ORDER BY is part of the fetch, not a client re-sort.
  const sortParam: ToolSort | undefined = sort
    ? { by: sort as ToolSortColumn, dir: desc === false ? 'asc' : 'desc' }
    : undefined

  const { data, isLoading } = useQuery(toolsPageQuery(range, dimensions, sortParam, page))
  const { data: registrySignals } = useQuery(toolSignalsQuery())
  const rows = data?.rows ?? []

  const signalsByName = useMemo(
    () =>
      mergeSignalsByName(
        rows.map((r) => r.name),
        registrySignals,
      ),
    [rows, registrySignals],
  )

  const sorting: SortingState = useMemo(
    () => (sort ? [{ id: sort, desc: desc ?? true }] : [{ id: 'calls', desc: true }]),
    [sort, desc],
  )

  // Sort / dimension / range changes reset the page offset — the new ORDER BY
  // (or filter) makes the old offset meaningless.
  const setSorting = (next: SortingState) => {
    const first = next[0]
    void navigate({
      search: (prev) => ({ ...prev, sort: first?.id, desc: first ? first.desc : undefined, page: undefined }),
      replace: true,
    })
  }
  const setRange = (r: typeof range) => {
    setRangeRaw(r)
    void navigate({ search: (prev) => ({ ...prev, page: undefined }) })
  }
  const setDimension = (key: string, value: string) => {
    setDimValues((prev) => ({ ...prev, [key]: value }))
    void navigate({ search: (prev) => ({ ...prev, page: undefined }) })
  }

  // CSV exports the whole catalog, not just the visible page — fetched on click.
  const exportRows = (): Promise<ToolRow[]> =>
    queryClient.ensureQueryData(toolsCatalogQuery(range, dimensions, sortParam))

  return (
    <Page title="Tools">
      <ToolsDataTable
        data={rows}
        signalsByName={signalsByName}
        isLoading={isLoading}
        sorting={sorting}
        onSortingChange={setSorting}
        onRowClick={(row) => navigate({ search: (prev) => ({ ...prev, tool: row.name }) })}
        range={range}
        onRangeChange={setRange}
        dimensions={dimValues}
        onDimensionChange={setDimension}
        onExport={exportRows}
        serverPagination={{
          pageIndex: page,
          hasMore: data?.hasMore ?? false,
          onPageChange: (p) => navigate({ search: (prev) => ({ ...prev, page: p || undefined }) }),
        }}
      />
    </Page>
  )
}
