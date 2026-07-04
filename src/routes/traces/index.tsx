import { useQuery } from '@tanstack/react-query'
import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { AUTO_REFRESH_MS } from '#/components/auto-refresh-select'
import type { ServerFilters } from '#/components/data-table-toolbar'
import { Page } from '#/components/page'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '#/components/ui/tabs'
import { scoreSummariesQuery } from '#/features/evaluation'
import { useAutoRefresh } from '#/hooks/use-auto-refresh'
import { useTimeRange } from '#/hooks/use-time-range'
import { spansQuery, tracesQuery } from './-data'
import { SPAN_SERVER_FACETS, SpansDataTable } from './-spans-data-table'
import { TRACE_SERVER_FACETS, TracesDataTable } from './-traces-data-table'

type TabValue = 'traces' | 'spans'

export const Route = createFileRoute('/traces/')({
  validateSearch: (
    search: Record<string, unknown>,
  ): {
    tab?: TabValue
    trace?: string
    session?: string
    tp?: number
    sp?: number
    tcat?: string
    tst?: string
    tq?: string
    sknd?: string
    sq?: string
  } => {
    const rawTab = typeof search.tab === 'string' ? search.tab : ''
    const rawTrace = typeof search.trace === 'string' ? search.trace.trim() : ''
    const rawSession = typeof search.session === 'string' ? search.session.trim() : ''
    const tp = Math.max(0, Math.floor(Number(search.tp) || 0))
    const sp = Math.max(0, Math.floor(Number(search.sp) || 0))
    const s = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : undefined)
    return {
      ...(rawTab === 'spans' ? { tab: 'spans' as const } : {}),
      ...(rawTrace ? { trace: rawTrace } : {}),
      ...(rawSession ? { session: rawSession } : {}),
      ...(tp ? { tp } : {}),
      ...(sp ? { sp } : {}),
      ...(s(search.tcat) ? { tcat: s(search.tcat) } : {}),
      ...(s(search.tst) ? { tst: s(search.tst) } : {}),
      ...(s(search.tq) ? { tq: s(search.tq) } : {}),
      ...(s(search.sknd) ? { sknd: s(search.sknd) } : {}),
      ...(s(search.sq) ? { sq: s(search.sq) } : {}),
    }
  },
  component: TracesIndex,
})

function TracesIndex() {
  const { tab, tp = 0, sp = 0, tcat, tst, tq, sknd, sq } = Route.useSearch()
  const navigate = useNavigate({ from: Route.fullPath })
  const activeTab: TabValue = tab ?? 'traces'
  const [range, setRangeRaw] = useTimeRange()
  const [autoRefresh, setAutoRefresh] = useAutoRefresh()

  // Range/filter changes invalidate the current page offset — reset both tabs to 0.
  const setRange = (r: typeof range) => {
    setRangeRaw(r)
    void navigate({ search: (prev) => ({ ...prev, tp: undefined, sp: undefined }) })
  }

  const traceFilters = { category: tcat, status: tst, search: tq }
  const spanFilters = { kind: sknd, search: sq }

  const tracesQ = useQuery({
    ...tracesQuery(range, '', tp, traceFilters),
    refetchInterval: AUTO_REFRESH_MS[autoRefresh],
    enabled: activeTab === 'traces',
  })
  const spansQ = useQuery({
    ...spansQuery(range, '', sp, spanFilters),
    refetchInterval: AUTO_REFRESH_MS[autoRefresh],
    enabled: activeTab === 'spans',
  })

  const traceScoresQ = useQuery({ ...scoreSummariesQuery('trace'), enabled: activeTab === 'traces' })

  const traces = tracesQ.data?.traces ?? []
  const spans = spansQ.data?.spans ?? []

  const traceServerFilters: ServerFilters = {
    facets: TRACE_SERVER_FACETS,
    values: { category: tcat, status: tst },
    onFacetChange: (columnId, v) =>
      void navigate({
        search: (prev) => ({ ...prev, [columnId === 'category' ? 'tcat' : 'tst']: v || undefined, tp: undefined }),
      }),
    search: tq ?? '',
    onSearchChange: (v) => void navigate({ search: (prev) => ({ ...prev, tq: v || undefined, tp: undefined }) }),
  }

  const spanServerFilters: ServerFilters = {
    facets: SPAN_SERVER_FACETS,
    values: { kind: sknd },
    onFacetChange: (_columnId, v) =>
      void navigate({ search: (prev) => ({ ...prev, sknd: v || undefined, sp: undefined }) }),
    search: sq ?? '',
    onSearchChange: (v) => void navigate({ search: (prev) => ({ ...prev, sq: v || undefined, sp: undefined }) }),
  }

  return (
    <Page title="Traces">
      <Tabs
        value={activeTab}
        onValueChange={(v) =>
          void navigate({
            search: (prev) => ({ ...prev, tab: v === 'spans' ? ('spans' as const) : undefined }),
            replace: true,
          })
        }
        className="flex min-h-0 flex-1 flex-col gap-0"
      >
        <div className="border-b">
          <TabsList variant="line" className="h-auto gap-x-4 px-4 lg:px-6">
            <TabsTrigger value="traces" className="flex-none px-3 pb-2">
              Traces
            </TabsTrigger>
            <TabsTrigger value="spans" className="flex-none px-3 pb-2">
              Spans
            </TabsTrigger>
          </TabsList>
        </div>
        <TabsContent value="traces" className="flex min-h-0 flex-1 flex-col">
          <TracesDataTable
            data={traces}
            isLoading={tracesQ.isLoading}
            scoreSummaries={traceScoresQ.data}
            serverFilters={traceServerFilters}
            onRowClick={(row) => {
              void navigate({ search: (prev) => ({ ...prev, trace: row.id }) })
            }}
            range={range}
            onRangeChange={setRange}
            autoRefresh={autoRefresh}
            onAutoRefreshChange={setAutoRefresh}
            onRefresh={() => {
              void tracesQ.refetch()
            }}
            refreshing={tracesQ.isFetching}
            serverPagination={{
              pageIndex: tp,
              hasMore: tracesQ.data?.hasMore ?? false,
              onPageChange: (p) => void navigate({ search: (prev) => ({ ...prev, tp: p || undefined }) }),
            }}
          />
        </TabsContent>
        <TabsContent value="spans" className="flex min-h-0 flex-1 flex-col">
          <SpansDataTable
            data={spans}
            isLoading={spansQ.isLoading}
            serverFilters={spanServerFilters}
            onRowClick={(row) => {
              void navigate({ search: (prev) => ({ ...prev, trace: row.traceId }) })
            }}
            range={range}
            onRangeChange={setRange}
            autoRefresh={autoRefresh}
            onAutoRefreshChange={setAutoRefresh}
            onRefresh={() => {
              void spansQ.refetch()
            }}
            refreshing={spansQ.isFetching}
            serverPagination={{
              pageIndex: sp,
              hasMore: spansQ.data?.hasMore ?? false,
              onPageChange: (p) => void navigate({ search: (prev) => ({ ...prev, sp: p || undefined }) }),
            }}
          />
        </TabsContent>
      </Tabs>
    </Page>
  )
}
