import { useQuery } from '@tanstack/react-query'
import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { useMemo } from 'react'
import { AUTO_REFRESH_MS } from '#/components/auto-refresh-select'
import { Page } from '#/components/page'
import { PageBreadcrumb } from '#/components/page-breadcrumb'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '#/components/ui/tabs'
import { FiresTable, TaskCost, TaskHero, taskFiresQuery, taskRollupQuery, tasksFromRollupRows } from '#/features/tasks'
import { useAutoRefresh } from '#/hooks/use-auto-refresh'
import { useTimeRange } from '#/hooks/use-time-range'
import { windowMs } from '#/lib/time-range'

type TabValue = 'fires' | 'cost'

export const Route = createFileRoute('/tasks/$taskKey')({
  validateSearch: (search: Record<string, unknown>): { tab?: TabValue; trace?: string; session?: string } => {
    const trace = typeof search.trace === 'string' ? search.trace.trim() : ''
    const session = typeof search.session === 'string' ? search.session.trim() : ''
    return {
      ...(search.tab === 'cost' ? { tab: 'cost' as const } : {}),
      ...(trace ? { trace } : {}),
      ...(session ? { session } : {}),
    }
  },
  component: TaskDetail,
})

function TaskDetail() {
  const { taskKey: encoded } = Route.useParams()
  const taskKey = decodeURIComponent(encoded)
  const { tab } = Route.useSearch()
  const activeTab: TabValue = tab ?? 'fires'
  const navigate = useNavigate({ from: Route.fullPath })
  const [range] = useTimeRange()
  const [autoRefresh] = useAutoRefresh()

  const { data: rollup } = useQuery({
    ...taskRollupQuery(range, taskKey),
    refetchInterval: AUTO_REFRESH_MS[autoRefresh],
  })
  const { data: firesData, isLoading } = useQuery({
    ...taskFiresQuery(range, taskKey),
    refetchInterval: AUTO_REFRESH_MS[autoRefresh],
  })

  // The hero row is the SQL rollup (grouped by the same taskKey WHERE that
  // filters the fires); the fires list drives the tables. No JS re-aggregation.
  const { row, fires, fromMs, toMs } = useMemo(() => {
    const { from, to } = windowMs(range)
    const rows = tasksFromRollupRows(rollup?.rows ?? [], { fromMs: from, toMs: to })
    const traces = firesData?.traces ?? []
    return {
      row: rows[0],
      fires: [...traces].sort((a, b) => b.startedAtMs - a.startedAtMs),
      fromMs: from,
      toMs: to,
    }
  }, [rollup?.rows, firesData?.traces, range])

  return (
    <div className="flex h-full flex-col">
      <Page
        title={
          <PageBreadcrumb
            crumbs={[
              { label: 'Tasks', to: '/tasks' },
              { label: row?.name ?? row?.taskId ?? humanizeKey(taskKey), className: 'max-w-[420px] truncate' },
            ]}
          />
        }
      >
        {!row ? (
          <div className="px-4 py-12 text-sm text-muted-foreground lg:px-6">
            {isLoading ? 'Loading task…' : 'No fires for this task in the current time window.'}
          </div>
        ) : (
          <>
            <TaskHero
              row={row}
              fires={fires}
              fromMs={fromMs}
              toMs={toMs}
              onFireClick={(t) => {
                void navigate({ search: (prev) => ({ ...prev, trace: t.id }) })
              }}
            />
            <Tabs
              value={activeTab}
              onValueChange={(v) =>
                void navigate({
                  search: (prev) => ({ ...prev, tab: v === 'cost' ? ('cost' as const) : undefined }),
                  replace: true,
                })
              }
              className="flex min-h-0 flex-1 flex-col gap-0"
            >
              <div className="border-t">
                <TabsList variant="line" className="h-auto gap-x-4 px-4 lg:px-6">
                  <TabsTrigger value="fires" className="flex-none px-3 pb-2">
                    Fires
                  </TabsTrigger>
                  <TabsTrigger value="cost" className="flex-none px-3 pb-2">
                    Cost
                  </TabsTrigger>
                </TabsList>
              </div>
              <TabsContent value="fires" className="flex min-h-0 flex-1 flex-col">
                <FiresTable
                  data={fires}
                  onRowClick={(t) => {
                    void navigate({ search: (prev) => ({ ...prev, trace: t.id }) })
                  }}
                />
              </TabsContent>
              <TabsContent value="cost" className="flex min-h-0 flex-1 flex-col">
                <TaskCost
                  fires={fires}
                  onRowClick={(t) => {
                    void navigate({ search: (prev) => ({ ...prev, trace: t.id }) })
                  }}
                />
              </TabsContent>
            </Tabs>
          </>
        )}
      </Page>
    </div>
  )
}

function humanizeKey(key: string): string {
  const [, rest] = key.split(':', 2)
  return rest ?? key
}
