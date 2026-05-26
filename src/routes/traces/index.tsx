import { useQuery } from '@tanstack/react-query'
import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { AUTO_REFRESH_MS } from '#/components/auto-refresh-select'
import { Page } from '#/components/page'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '#/components/ui/tabs'
import { useAutoRefresh } from '#/hooks/use-auto-refresh'
import { useTimeRange } from '#/hooks/use-time-range'
import { useScopedUserId } from '#/hooks/use-user'
import { spansQuery, tracesQuery } from './-data'
import { SpansDataTable } from './-spans-data-table'
import { TracesDataTable } from './-traces-data-table'

type TabValue = 'traces' | 'spans'

export const Route = createFileRoute('/traces/')({
  validateSearch: (search: Record<string, unknown>): { tab?: TabValue; trace?: string; session?: string } => {
    const rawTab = typeof search.tab === 'string' ? search.tab : ''
    const rawTrace = typeof search.trace === 'string' ? search.trace.trim() : ''
    const rawSession = typeof search.session === 'string' ? search.session.trim() : ''
    return {
      ...(rawTab === 'spans' ? { tab: 'spans' as const } : {}),
      ...(rawTrace ? { trace: rawTrace } : {}),
      ...(rawSession ? { session: rawSession } : {}),
    }
  },
  component: TracesIndex,
})

function TracesIndex() {
  const { tab } = Route.useSearch()
  const navigate = useNavigate({ from: Route.fullPath })
  const activeTab: TabValue = tab ?? 'traces'
  const [range, setRange] = useTimeRange()
  const [autoRefresh, setAutoRefresh] = useAutoRefresh()
  const scopedUserId = useScopedUserId()

  const tracesQ = useQuery({
    ...tracesQuery(range, scopedUserId),
    refetchInterval: AUTO_REFRESH_MS[autoRefresh],
    enabled: activeTab === 'traces',
  })
  const spansQ = useQuery({
    ...spansQuery(range, scopedUserId),
    refetchInterval: AUTO_REFRESH_MS[autoRefresh],
    enabled: activeTab === 'spans',
  })

  const traces = tracesQ.data?.traces ?? []
  const spans = spansQ.data?.spans ?? []

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
          />
        </TabsContent>
        <TabsContent value="spans" className="flex min-h-0 flex-1 flex-col">
          <SpansDataTable
            data={spans}
            isLoading={spansQ.isLoading}
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
          />
        </TabsContent>
      </Tabs>
    </Page>
  )
}
