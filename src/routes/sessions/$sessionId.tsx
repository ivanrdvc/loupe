import { ChevronLeftIcon } from '@heroicons/react/16/solid'
import { ChatBubbleLeftRightIcon } from '@heroicons/react/24/outline'
import { useQuery } from '@tanstack/react-query'
import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { useEffect, useState } from 'react'
import {
  AUTO_REFRESH_MS,
  type AutoRefreshInterval,
  AutoRefreshSelect,
  DEFAULT_AUTO_REFRESH_INTERVAL,
} from '#/components/auto-refresh-select'
import { ConversationView } from '#/components/conversation-view'
import { EmptyState } from '#/components/empty-state'
import { IconTabs } from '#/components/icon-tabs'
import { TimeRangeSelect } from '#/components/time-range-select'
import { Link } from '#/components/ui/catalyst/link'
import { DEFAULT_TIME_RANGE_DAYS, parseTimeRangeDays, type TimeRangeDays } from '#/lib/time-range'
import { SessionContextView } from './-components/session-inspect/context'
import { SESSION_VIEW_TABS, type SessionInspectView } from './-components/session-inspect/drawer'
import { SessionInspectLayout } from './-components/session-inspect/overview'
import { sessionQuery } from './-data'

export const Route = createFileRoute('/sessions/$sessionId')({
  validateSearch: (search: Record<string, unknown>): SessionSearch => ({
    days: parseTimeRangeDays(search.days),
    view: parseSessionView(search.view) ?? 'conversation',
    span: parseSpanParam(search.span),
  }),
  loaderDeps: ({ search }) => ({ days: search.days }),
  loader: ({ context, params, deps }) => context.queryClient.ensureQueryData(sessionQuery(params.sessionId, deps.days)),
  component: SessionDetail,
})

interface SessionSearch {
  days: TimeRangeDays
  view: SessionInspectView
  span?: string
}

function parseSessionView(value: unknown): SessionInspectView | undefined {
  if (value === 'conversation') return 'conversation'
  if (value === 'context') return 'context'
  if (value === 'spans' || value === 'trace') return 'spans'
  return undefined
}

function parseSpanParam(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : undefined
}

function SessionDetail() {
  const { sessionId } = Route.useParams()
  const search = Route.useSearch()
  const navigate = useNavigate({ from: Route.fullPath })
  const [autoRefresh, setAutoRefresh] = useState(DEFAULT_AUTO_REFRESH_INTERVAL)
  const { data, refetch, isFetching } = useQuery({
    ...sessionQuery(sessionId, search.days),
    refetchInterval: AUTO_REFRESH_MS[autoRefresh],
  })
  const [selectedId, setSelectedId] = useState<string | null>(() =>
    search.view === 'spans' && search.span ? search.span : null,
  )

  useEffect(() => {
    setSelectedId(search.view === 'spans' && search.span ? search.span : null)
  }, [search.view, search.span])

  const setDays = (days: TimeRangeDays) => {
    navigate({
      search: (prev) => ({ ...prev, days }),
    })
  }

  const spans = data?.spans ?? []
  const source = data?.source ?? null
  const provider = data?.provider
  const fingerprint = data?.fingerprint
  const inspectView = search.view
  const setInspectView = (view: SessionInspectView) => {
    navigate({
      search: (prev) => {
        if (view === 'conversation') {
          return { days: prev.days, view: 'conversation' }
        }
        if (view === 'context') {
          return { days: prev.days, view: 'context' }
        }
        return {
          days: prev.days,
          view: 'spans',
          ...(typeof prev.span === 'string' && prev.span.length > 0 ? { span: prev.span } : {}),
        }
      },
    })
  }

  return (
    <div className="flex h-full min-h-[60vh] flex-col">
      <Header
        source={source}
        provider={provider}
        fingerprint={fingerprint}
        days={search.days}
        onDaysChange={setDays}
        autoRefresh={autoRefresh}
        onAutoRefreshChange={setAutoRefresh}
        onRefresh={() => {
          void refetch()
        }}
        refreshing={isFetching}
      />

      <div className="flex min-h-0 flex-1 flex-col overflow-hidden border-t border-zinc-950/10 dark:border-white/10">
        <SessionInspectTabs active={inspectView} onSelect={setInspectView} />
        <div className="min-h-0 flex-1 overflow-hidden bg-white dark:bg-zinc-900">
          {!data ? (
            <EmptyState
              icon={ChatBubbleLeftRightIcon}
              title="Session not found"
              description="No spans for this session id in the active provider. Widen the time range, or check that this id was emitted."
            />
          ) : inspectView === 'spans' ? (
            <SessionInspectLayout spans={spans} loading={false} selectedId={selectedId} onSelect={setSelectedId} />
          ) : inspectView === 'conversation' ? (
            <ConversationView spans={spans} onSelect={setSelectedId} />
          ) : (
            <SessionContextView spans={spans} />
          )}
        </div>
      </div>
    </div>
  )
}

function SessionInspectTabs({
  active,
  onSelect,
}: {
  active: SessionInspectView
  onSelect: (view: SessionInspectView) => void
}) {
  return (
    <nav
      className="flex shrink-0 flex-wrap border-zinc-950/10 border-b bg-white px-4 py-2 dark:border-white/10 dark:bg-zinc-900"
      aria-label="Session view"
    >
      <IconTabs tabs={SESSION_VIEW_TABS} value={active} onChange={onSelect} aria-label="Session view" />
    </nav>
  )
}

interface HeaderProps {
  source: 'attribute' | 'agent-instance' | null
  provider?: string
  fingerprint?: string
  days: TimeRangeDays
  onDaysChange: (days: TimeRangeDays) => void
  autoRefresh: AutoRefreshInterval
  onAutoRefreshChange: (value: AutoRefreshInterval) => void
  onRefresh: () => void
  refreshing?: boolean
}

function Header({
  source,
  provider,
  fingerprint,
  days,
  onDaysChange,
  autoRefresh,
  onAutoRefreshChange,
  onRefresh,
  refreshing,
}: HeaderProps) {
  return (
    <header className="flex flex-wrap items-center gap-x-3 gap-y-2 px-4 py-4">
      <Link
        href="/sessions"
        search={days && days !== DEFAULT_TIME_RANGE_DAYS ? { days } : undefined}
        aria-label="Back to sessions"
        className="-ml-1 inline-flex size-8 items-center justify-center rounded-md text-zinc-500 hover:bg-zinc-100 hover:text-zinc-950 dark:text-zinc-400 dark:hover:bg-white/5 dark:hover:text-white"
      >
        <ChevronLeftIcon className="size-4 fill-current" />
      </Link>
      <h1 className="text-lg font-semibold tracking-tight text-zinc-950 dark:text-white">Session</h1>
      {source === 'agent-instance' && (
        <span
          title="Derived from the agent-instance hex in span names; no session.id attribute present."
          className="rounded bg-amber-500/10 px-1.5 py-0.5 text-[10px] font-medium text-amber-700 dark:text-amber-300"
        >
          heuristic id
        </span>
      )}
      {provider === 'openobserve' && (
        <span className="rounded bg-emerald-500/10 px-1.5 py-0.5 text-[10px] font-medium text-emerald-700 dark:text-emerald-300">
          via {provider} · {fingerprint}
        </span>
      )}
      <div className="flex w-full min-w-0 flex-wrap items-center gap-2 sm:ml-auto sm:w-auto sm:flex-nowrap">
        <TimeRangeSelect value={days} onChange={onDaysChange} />
        <AutoRefreshSelect
          value={autoRefresh}
          onChange={onAutoRefreshChange}
          onRefresh={onRefresh}
          loading={refreshing}
        />
      </div>
    </header>
  )
}
