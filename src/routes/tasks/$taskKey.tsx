import { useQuery } from '@tanstack/react-query'
import { createFileRoute, Link, useNavigate } from '@tanstack/react-router'
import { useMemo } from 'react'
import { AUTO_REFRESH_MS } from '#/components/auto-refresh-select'
import { Page } from '#/components/page'
import { Badge } from '#/components/ui/badge'
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '#/components/ui/breadcrumb'
import { useAutoRefresh } from '#/hooks/use-auto-refresh'
import { useTimeRange } from '#/hooks/use-time-range'
import { useScopedUserId } from '#/hooks/use-user'
import { formatAgo, formatDuration, formatPercent } from '#/lib/format'
import { taskIdentity } from '#/lib/tasks/identity'
import { rollupTasks, type TaskRow } from '#/lib/tasks/rollup'
import type { TraceSummary } from '#/lib/telemetry'
import { windowMs } from '#/lib/time-range'
import { cn } from '#/lib/utils'
import { FiresTable } from './-components/fires-table'
import { TaskHero } from './-components/task-hero'
import { tasksTracesQuery } from './-data'

export const Route = createFileRoute('/tasks/$taskKey')({
  validateSearch: (search: Record<string, unknown>): { trace?: string } => {
    const raw = typeof search.trace === 'string' ? search.trace.trim() : ''
    return raw ? { trace: raw } : {}
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
          <Breadcrumb>
            <BreadcrumbList>
              <BreadcrumbItem>
                <BreadcrumbLink asChild>
                  <Link to="/tasks">Tasks</Link>
                </BreadcrumbLink>
              </BreadcrumbItem>
              <BreadcrumbSeparator />
              <BreadcrumbItem>
                <BreadcrumbPage className="max-w-[420px] truncate">
                  {row?.name ?? row?.taskId ?? humanizeKey(taskKey)}
                </BreadcrumbPage>
              </BreadcrumbItem>
            </BreadcrumbList>
          </Breadcrumb>
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
              conversationId={row.conversationId ?? sharedConversation(fires)}
              onFireClick={(t) => {
                void navigate({ search: (prev) => ({ ...prev, trace: t.id }) })
              }}
            />
            <Header row={row} fires={fires} />
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

function Header({ row, fires }: { row: TaskRow; fires: TraceSummary[] }) {
  const errPct = (1 - row.successRate) * 100
  const errTone =
    errPct >= 10
      ? 'text-rose-700 dark:text-rose-300'
      : errPct >= 2
        ? 'text-amber-700 dark:text-amber-300'
        : 'text-foreground'
  // Find a sample fire that actually carries the conversation id; some
  // rows have a `conversationId` lifted onto the row but most callers expect
  // the raw value via a fire.
  const conversationId = row.conversationId ?? sharedConversation(fires)
  return (
    <div className="flex flex-col gap-3 border-b px-4 pb-4 lg:px-6">
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant="outline" className="px-1.5">
          {row.kind === 'one_shot' ? 'One-shot' : row.kind[0]?.toUpperCase() + row.kind.slice(1)}
        </Badge>
        {row.identitySource === 'derived' && (
          <Badge variant="outline" className="px-1.5 text-[10px] text-muted-foreground">
            derived
          </Badge>
        )}
        {row.schedule && (
          <span className="font-mono text-xs text-muted-foreground" title={row.schedule}>
            {row.schedule}
          </span>
        )}
        {row.source && !row.schedule && (
          <span className="font-mono text-xs text-muted-foreground" title={row.source}>
            {row.source}
          </span>
        )}
      </div>
      <div className="flex flex-wrap items-baseline gap-x-6 gap-y-1 text-sm tabular-nums">
        <Stat label="fires" value={row.fires.toLocaleString()} />
        <Dot />
        <Stat label="errors" value={`${formatPercent(row.errored, row.fires)} (${row.errored})`} tone={errTone} />
        <Dot />
        <Stat label="avg dur" value={formatDuration(row.avgDurationMs)} />
        <Dot />
        <Stat label="last fire" value={formatAgo(row.lastFireMs)} />
      </div>
      <div className="flex flex-wrap items-center gap-x-6 gap-y-1 text-xs text-muted-foreground">
        {row.agent && (
          <div>
            <span>agent </span>
            <span className="text-foreground">{row.agent}</span>
          </div>
        )}
        {row.serviceName && row.serviceName !== row.agent && (
          <div>
            <span>service </span>
            <span className="font-mono text-foreground">{row.serviceName}</span>
          </div>
        )}
        {conversationId && (
          <div className="flex items-center gap-1">
            <span>created by </span>
            <Link
              to="/sessions/$sessionId"
              params={{ sessionId: conversationId }}
              search={{ range: 7, view: 'conversation' }}
              className="font-mono text-foreground hover:underline"
              title={conversationId}
            >
              {conversationId.length > 16
                ? `${conversationId.slice(0, 10)}…${conversationId.slice(-4)}`
                : conversationId}
            </Link>
          </div>
        )}
        {row.taskId && (
          <div>
            <span>task.id </span>
            <span className="font-mono text-foreground">{row.taskId}</span>
          </div>
        )}
      </div>
    </div>
  )
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <span>
      <strong className={cn('font-medium', tone)}>{value}</strong>{' '}
      <span className="text-muted-foreground">{label}</span>
    </span>
  )
}

function Dot() {
  return (
    <span aria-hidden className="text-muted-foreground/60">
      ·
    </span>
  )
}

function humanizeKey(key: string): string {
  const [, rest] = key.split(':', 2)
  return rest ?? key
}

function sharedConversation(fires: TraceSummary[]): string | undefined {
  if (fires.length === 0) return undefined
  const first = fires[0]?.sessionId
  if (!first) return undefined
  const allSame = fires.every((t) => t.sessionId === first && t.sessionId !== t.id)
  return allSame ? first : undefined
}
