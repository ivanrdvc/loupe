import { ChatBubbleLeftRightIcon } from '@heroicons/react/20/solid'
import { useQuery } from '@tanstack/react-query'
import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { type ReactNode, useMemo, useState } from 'react'
import { AUTO_REFRESH_MS, AutoRefreshSelect, DEFAULT_AUTO_REFRESH_INTERVAL } from '#/components/auto-refresh-select'
import { EmptyState } from '#/components/empty-state'
import { EnvSelect } from '#/components/env-select'
import { SearchInput } from '#/components/search-input'
import { TimeRangeSelect } from '#/components/time-range-select'
import { useEnv } from '#/hooks/use-env'
import type { SessionSummary } from '#/lib/telemetry'
import { parseTimeRangeDays, type TimeRangeDays } from '#/lib/time-range'
import { SessionRow } from './-components/session-row'
import { SessionsDrawerHost } from './-components/sessions-drawer-host'
import { parseStatusFilter, type StatusFilter, StatusSelect } from './-components/status-select'
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

function SessionsList() {
  const search = Route.useSearch()
  const navigate = useNavigate({ from: Route.fullPath })
  const [autoRefresh, setAutoRefresh] = useState(DEFAULT_AUTO_REFRESH_INTERVAL)
  const {
    data: loaderData,
    refetch,
    isFetching,
  } = useQuery({
    ...sessionsQuery(search.days),
    refetchInterval: AUTO_REFRESH_MS[autoRefresh],
  })
  const sessions: SessionSummary[] = loaderData?.sessions ?? []

  const query = search.q ?? ''
  const status = search.status ?? 'all'
  const [env, setEnv] = useEnv()
  const [previewSessionId, setPreviewSessionId] = useState<string | null>(null)

  const setQuery = (nextQuery: string) => {
    navigate({
      replace: true,
      search: (prev) => ({ ...prev, q: nextQuery || undefined }),
    })
  }

  const setStatus = (nextStatus: StatusFilter) => {
    navigate({
      replace: true,
      search: (prev) => ({ ...prev, status: nextStatus === 'all' ? undefined : nextStatus }),
    })
  }

  const setDays = (days: TimeRangeDays) => {
    navigate({
      search: (prev) => ({ ...prev, days }),
    })
  }

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return sessions.filter((s) => {
      const hasError = !!s.hasError
      if (status === 'ok' && hasError) return false
      if (status === 'error' && !hasError) return false
      if (q) {
        const agents = s.agents.join(' ').toLowerCase()
        const title = s.title?.toLowerCase() ?? ''
        const user = [s.userName, s.userId, s.host].filter(Boolean).join(' ').toLowerCase()
        if (!agents.includes(q) && !s.sessionId.toLowerCase().includes(q) && !title.includes(q) && !user.includes(q)) {
          return false
        }
      }
      return true
    })
  }, [sessions, query, status])

  return (
    <div className="flex h-full flex-col">
      <header className="flex flex-wrap items-center gap-x-3 gap-y-2 pb-3">
        <h1 className="text-lg font-semibold tracking-tight text-zinc-950 dark:text-white">Sessions</h1>
        <div className="flex w-full min-w-0 flex-col gap-2 sm:ml-auto sm:w-auto sm:flex-row sm:items-center">
          <SearchInput value={query} onChange={setQuery} placeholder="Search agents, users, ids…" />
          <div className="flex flex-wrap items-center gap-2">
            <EnvSelect value={env} onChange={setEnv} />
            <TimeRangeSelect value={search.days} onChange={setDays} />
            <StatusSelect value={status} onChange={setStatus} />
            <AutoRefreshSelect
              value={autoRefresh}
              onChange={setAutoRefresh}
              onRefresh={() => {
                void refetch()
              }}
              loading={isFetching}
            />
          </div>
        </div>
      </header>

      {sessions.length === 0 ? (
        <EmptyState
          icon={ChatBubbleLeftRightIcon}
          title="No sessions yet"
          description={
            <>
              Emit{' '}
              <code className="rounded bg-zinc-950/[0.06] px-1.5 py-0.5 font-mono text-[11px] text-zinc-800 dark:bg-white/[0.08] dark:text-zinc-200">
                session.id
              </code>{' '}
              on spans, or use{' '}
              <code className="rounded bg-zinc-950/[0.06] px-1.5 py-0.5 font-mono text-[11px] text-zinc-800 dark:bg-white/[0.08] dark:text-zinc-200">
                invoke_agent Name(hex)
              </code>{' '}
              naming so rows can be derived.
            </>
          }
        />
      ) : (
        <>
          <MetaStrip
            provider={loaderData?.provider}
            fingerprint={loaderData?.fingerprint}
            truncated={loaderData?.truncated}
            isFetching={isFetching}
          />
          <div className="-mx-3 overflow-hidden border-y border-zinc-200 dark:border-zinc-800 lg:-mx-4">
            <table className="w-full table-fixed text-sm">
              <thead className="bg-zinc-100/70 dark:bg-zinc-800/50">
                <tr className="border-b border-zinc-200 dark:border-zinc-800">
                  <th className="h-10 w-28 px-3 text-left align-middle text-xs font-medium text-zinc-500 dark:text-zinc-400 lg:pl-4">
                    Last seen
                  </th>
                  <th className="h-10 w-[14%] px-3 text-left align-middle text-xs font-medium text-zinc-500 dark:text-zinc-400">
                    Session
                  </th>
                  <th className="h-10 px-3 text-left align-middle text-xs font-medium text-zinc-500 dark:text-zinc-400">
                    Input
                  </th>
                  <th className="h-10 w-[14%] px-3 text-left align-middle text-xs font-medium text-zinc-500 dark:text-zinc-400">
                    User
                  </th>
                  <th className="h-10 w-20 px-3 text-right align-middle text-xs font-medium text-zinc-500 dark:text-zinc-400">
                    Tokens
                  </th>
                  <th className="h-10 w-20 px-3 text-right align-middle text-xs font-medium text-zinc-500 dark:text-zinc-400">
                    Cost
                  </th>
                  <th className="h-10 w-14 px-3 text-right align-middle text-xs font-medium text-zinc-500 dark:text-zinc-400 lg:pr-4">
                    Turns
                  </th>
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-3 py-10 text-center text-sm text-zinc-500 dark:text-zinc-400">
                      No sessions match your filters.
                    </td>
                  </tr>
                ) : (
                  filtered.map((s) => (
                    <SessionRow key={s.sessionId} session={s} onOpenSession={() => setPreviewSessionId(s.sessionId)} />
                  ))
                )}
              </tbody>
            </table>
          </div>
        </>
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
    parts.push({
      id: 'refresh',
      node: <span className="text-zinc-500 dark:text-zinc-400">refreshing…</span>,
    })
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
    <div className="flex h-5 items-center gap-2 text-[11px] font-medium text-zinc-500 dark:text-zinc-400">
      {parts.map((p, i) => (
        <span key={p.id} className="flex items-center gap-2">
          {i > 0 && <span className="text-zinc-300 dark:text-zinc-700">·</span>}
          {p.node}
        </span>
      ))}
    </div>
  )
}
