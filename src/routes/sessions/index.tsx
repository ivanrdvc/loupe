import { ChatBubbleLeftRightIcon } from '@heroicons/react/20/solid'
import { useQuery } from '@tanstack/react-query'
import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { type ReactNode, useState } from 'react'
import { AUTO_REFRESH_MS, AutoRefreshSelect, DEFAULT_AUTO_REFRESH_INTERVAL } from '#/components/auto-refresh-select'
import { EmptyState } from '#/components/empty-state'
import { EnvSelect } from '#/components/env-select'
import { TimeRangeSelect } from '#/components/time-range-select'
import { useEnv } from '#/hooks/use-env'
import type { SessionSummary } from '#/lib/telemetry'
import { parseTimeRangeDays, type TimeRangeDays } from '#/lib/time-range'
import { DEFAULT_VISIBLE, sessionColumns } from './-components/data-table/columns'
import { DataTable } from './-components/data-table/data-table'
import { SessionsDrawerHost } from './-components/sessions-drawer-host'
import { parseStatusFilter, type StatusFilter } from './-components/status-select'
import { sessionsQuery } from './-data'

export const Route = createFileRoute('/sessions/')({
  validateSearch: (search: Record<string, unknown>): SessionsSearch => ({
    days: parseTimeRangeDays(search.days),
    q: typeof search.q === 'string' && search.q.length > 0 ? search.q : undefined,
    status: parseStatusFilter(search.status),
  }),
  loaderDeps: ({ search }) => ({ days: search.days }),
  loader: ({ context, deps }) => context.queryClient.ensureQueryData(sessionsQuery(deps.days)),
  component: SessionsList,
})

interface SessionsSearch {
  days: TimeRangeDays
  q?: string
  status?: Exclude<StatusFilter, 'all'>
}

const STATUS_FACET_OPTIONS = [
  { label: 'OK', value: 'ok' },
  { label: 'Error', value: 'error' },
]

function SessionsList() {
  const search = Route.useSearch()
  const navigate = useNavigate({ from: Route.fullPath })
  const [autoRefresh, setAutoRefresh] = useState(DEFAULT_AUTO_REFRESH_INTERVAL)
  const {
    data: loaderData,
    refetch,
    isFetching,
    isLoading,
  } = useQuery({
    ...sessionsQuery(search.days),
    refetchInterval: AUTO_REFRESH_MS[autoRefresh],
  })
  const sessions: SessionSummary[] = loaderData?.sessions ?? []

  const [env, setEnv] = useEnv()
  const [previewSessionId, setPreviewSessionId] = useState<string | null>(null)

  const setDays = (days: TimeRangeDays) => {
    navigate({
      search: (prev) => ({ ...prev, days }),
    })
  }

  const toolbarRight = (
    <>
      <EnvSelect value={env} onChange={setEnv} />
      <TimeRangeSelect value={search.days} onChange={setDays} />
      <AutoRefreshSelect
        value={autoRefresh}
        onChange={setAutoRefresh}
        onRefresh={() => {
          void refetch()
        }}
        loading={isFetching}
      />
    </>
  )

  return (
    <div className="flex h-full flex-col">
      <header className="flex flex-wrap items-baseline gap-x-3 gap-y-1 pb-3">
        <h1 className="text-lg font-semibold tracking-tight text-foreground">Sessions</h1>
      </header>

      <MetaStrip
        provider={loaderData?.provider}
        fingerprint={loaderData?.fingerprint}
        truncated={loaderData?.truncated}
        isFetching={isFetching}
      />

      {!isLoading && sessions.length === 0 ? (
        <EmptyState
          icon={ChatBubbleLeftRightIcon}
          title="No sessions yet"
          description={
            <>
              Emit{' '}
              <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-[11px] text-foreground">session.id</code>{' '}
              on spans, or use{' '}
              <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-[11px] text-foreground">
                invoke_agent Name(hex)
              </code>{' '}
              naming so rows can be derived.
            </>
          }
        />
      ) : (
        <div className="flex min-h-0 flex-1 flex-col pt-1">
          <DataTable
            columns={sessionColumns}
            data={sessions}
            loading={isLoading}
            storageKey="sessions-table-state-v1"
            defaultColumnVisibility={DEFAULT_VISIBLE}
            searchColumnId="sessionId"
            searchPlaceholder="Search agents, users, ids…"
            facets={[{ columnId: 'status', title: 'Status', options: STATUS_FACET_OPTIONS }]}
            onRowClick={(row) => setPreviewSessionId(row.sessionId)}
            rowClassName={(row) => (row.sessionId === previewSessionId ? 'bg-muted' : undefined)}
            toolbarSlot={() => <>{toolbarRight}</>}
          />
        </div>
      )}

      <SessionsDrawerHost
        previewSessionId={previewSessionId}
        days={search.days}
        onClose={() => setPreviewSessionId(null)}
      />
    </div>
  )
}

interface MetaStripProps {
  provider?: string
  fingerprint?: string
  truncated?: boolean
  isFetching: boolean
}

function MetaStrip({ provider, fingerprint, truncated, isFetching }: MetaStripProps) {
  const parts: { id: string; node: ReactNode }[] = []
  if (provider === 'openobserve') {
    parts.push({
      id: 'provider',
      node: (
        <span title={fingerprint} className="text-emerald-700 dark:text-emerald-400">
          via {provider}
        </span>
      ),
    })
  }
  if (isFetching) {
    parts.push({ id: 'refresh', node: <span className="text-muted-foreground">refreshing…</span> })
  }
  if (truncated) {
    parts.push({
      id: 'truncated',
      node: (
        <span
          title="Scan hit its row cap; older sessions may be missing. Narrow the time range to see them."
          className="text-rose-700 dark:text-rose-400"
        >
          truncated
        </span>
      ),
    })
  }
  if (parts.length === 0) return <div className="h-5" aria-hidden />
  return (
    <div className="flex h-5 items-center gap-2 text-[11px] font-medium text-muted-foreground">
      {parts.map((p, i) => (
        <span key={p.id} className="flex items-center gap-2">
          {i > 0 && <span className="text-border">·</span>}
          {p.node}
        </span>
      ))}
    </div>
  )
}
