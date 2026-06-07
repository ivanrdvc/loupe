import { useQuery } from '@tanstack/react-query'
import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { useMemo } from 'react'
import { AUTO_REFRESH_MS } from '#/components/auto-refresh-select'
import { Page } from '#/components/page'
import { PageBreadcrumb } from '#/components/page-breadcrumb'
import { rollupTasks, taskIdentity } from '#/features/tasks/rollup'
import { useAutoRefresh } from '#/hooks/use-auto-refresh'
import { useTimeRange } from '#/hooks/use-time-range'
import { useScopedUserId } from '#/hooks/use-user'
import type { TraceSummary } from '#/lib/telemetry'
import { windowMs } from '#/lib/time-range'
import { FiresTable } from './-components/fires-table'
import { TaskHero } from './-components/task-hero'
import { tasksTracesQuery } from './-data'

export const Route = createFileRoute('/tasks/$taskKey')({
  validateSearch: (search: Record<string, unknown>): { trace?: string; session?: string } => {
    const trace = typeof search.trace === 'string' ? search.trace.trim() : ''
    const session = typeof search.session === 'string' ? search.session.trim() : ''
    return {
      ...(trace ? { trace } : {}),
      ...(session ? { session } : {}),
    }
  },
  component: TaskDetail,
})

function TaskDetail() {
  const { taskKey: encoded } = Route.useParams()
  const taskKey = decodeURIComponent(encoded)
  const navigate = useNavigate({ from: Route.fullPath })
  const [range] = useTimeRange()
  const [autoRefresh] = useAutoRefresh()
  const scopedUserId = useScopedUserId()

  const { data, isLoading } = useQuery({
    ...tasksTracesQuery(range, scopedUserId),
    refetchInterval: AUTO_REFRESH_MS[autoRefresh],
  })

  const { row, fires, fromMs, toMs } = useMemo(() => {
    const { from, to } = windowMs(range)
    if (!data?.traces) return { row: undefined, fires: [] as TraceSummary[], fromMs: from, toMs: to }
    const matchingFires = data.traces.filter((t) => taskIdentity(t).key === taskKey)
    const rows = rollupTasks(matchingFires, { fromMs: from, toMs: to })
    return {
      row: rows[0],
      fires: matchingFires.sort((a, b) => b.startedAtMs - a.startedAtMs),
      fromMs: from,
      toMs: to,
    }
  }, [data?.traces, taskKey, range])

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
              conversationId={row.conversationId}
              onFireClick={(t) => {
                void navigate({ search: (prev) => ({ ...prev, trace: t.id }) })
              }}
            />
            <FiresTable
              data={fires}
              onRowClick={(t) => {
                void navigate({ search: (prev) => ({ ...prev, trace: t.id }) })
              }}
            />
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
