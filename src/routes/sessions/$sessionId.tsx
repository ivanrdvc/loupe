import { ChatBubbleLeftRightIcon } from '@heroicons/react/24/outline'
import { useQuery } from '@tanstack/react-query'
import { createFileRoute, Link, useNavigate } from '@tanstack/react-router'
import { useEffect, useState } from 'react'
import { AUTO_REFRESH_MS, AutoRefreshSelect, DEFAULT_AUTO_REFRESH_INTERVAL } from '#/components/auto-refresh-select'
import { ConversationView } from '#/components/conversation-view'
import { IconTabs } from '#/components/icon-tabs'
import { SiteHeader } from '#/components/site-header'
import { Badge } from '#/components/ui/badge'
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '#/components/ui/breadcrumb'
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '#/components/ui/empty'
import { truncateId } from '#/lib/format'
import { parse, type TimeRange } from '#/lib/time-range'
import { SessionContextView } from './-components/session-inspect/context'
import { SESSION_VIEW_TABS, type SessionInspectView } from './-components/session-inspect/drawer'
import { SessionInspectLayout } from './-components/session-inspect/overview'
import { sessionQuery } from './-data'

export const Route = createFileRoute('/sessions/$sessionId')({
  validateSearch: (search: Record<string, unknown>): SessionSearch => ({
    range: parse(search.range),
    view: parseSessionView(search.view) ?? 'conversation',
    span: parseSpanParam(search.span),
  }),
  loaderDeps: ({ search }) => ({ range: search.range }),
  loader: ({ context, params, deps }) =>
    context.queryClient.ensureQueryData(sessionQuery(params.sessionId, deps.range)),
  component: SessionDetail,
})

interface SessionSearch {
  range: TimeRange
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
    ...sessionQuery(sessionId, search.range),
    refetchInterval: AUTO_REFRESH_MS[autoRefresh],
  })
  const [selectedId, setSelectedId] = useState<string | null>(() =>
    search.view === 'spans' && search.span ? search.span : null,
  )

  useEffect(() => {
    setSelectedId(search.view === 'spans' && search.span ? search.span : null)
  }, [search.view, search.span])

  const spans = data?.spans ?? []
  const source = data?.source ?? null
  const provider = data?.provider
  const fingerprint = data?.fingerprint
  const crumbLabel = data?.title?.trim() || truncateId(sessionId)
  const inspectView = search.view
  const setInspectView = (view: SessionInspectView) => {
    navigate({
      search: (prev) => ({
        range: prev.range,
        view,
        ...(typeof prev.span === 'string' && prev.span.length > 0 ? { span: prev.span } : {}),
      }),
    })
  }

  return (
    <div className="flex h-full flex-col">
      <SiteHeader
        title={
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <h1 className="sr-only">Session</h1>
            <Breadcrumb>
              <BreadcrumbList>
                <BreadcrumbItem>
                  <BreadcrumbLink asChild>
                    <Link to="/sessions">Sessions</Link>
                  </BreadcrumbLink>
                </BreadcrumbItem>
                <BreadcrumbSeparator />
                <BreadcrumbItem>
                  <BreadcrumbPage className={data?.title ? undefined : 'font-mono'} title={sessionId}>
                    {crumbLabel}
                  </BreadcrumbPage>
                </BreadcrumbItem>
              </BreadcrumbList>
            </Breadcrumb>
            {source === 'agent-instance' && (
              <Badge
                variant="warning"
                title="Derived from the agent-instance hex in span names; no session.id attribute present."
              >
                heuristic id
              </Badge>
            )}
            {provider === 'openobserve' && (
              <Badge variant="success">
                via {provider} · {fingerprint}
              </Badge>
            )}
          </div>
        }
        actions={
          <AutoRefreshSelect
            value={autoRefresh}
            onChange={setAutoRefresh}
            onRefresh={() => {
              void refetch()
            }}
            loading={isFetching}
          />
        }
      />

      <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
        <SessionInspectTabs active={inspectView} onSelect={setInspectView} />
        <div className="min-h-0 flex-1 overflow-hidden bg-background">
          {!data ? (
            <Empty>
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <ChatBubbleLeftRightIcon />
                </EmptyMedia>
                <EmptyTitle>Session not found</EmptyTitle>
                <EmptyDescription>
                  No spans for this session id in the active provider. Widen the time range, or check that this id was
                  emitted.
                </EmptyDescription>
              </EmptyHeader>
            </Empty>
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
    <nav className="flex shrink-0 flex-wrap border-b bg-background px-4 py-2" aria-label="Session view">
      <IconTabs tabs={SESSION_VIEW_TABS} value={active} onChange={onSelect} aria-label="Session view" />
    </nav>
  )
}
