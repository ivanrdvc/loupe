import { ChatBubbleLeftRightIcon } from '@heroicons/react/24/outline'
import { useQuery } from '@tanstack/react-query'
import { createFileRoute, Link, useNavigate } from '@tanstack/react-router'
import { useEffect, useMemo, useState } from 'react'
import { AUTO_REFRESH_MS } from '#/components/auto-refresh-select'
import { ContextWindow } from '#/components/context-window'
import { ConversationView } from '#/components/conversation-view'
import { CopyButton } from '#/components/copy-button'
import { InspectLayout } from '#/components/inspect/overview'
import { useRawRoots } from '#/components/inspect/use-raw-roots'
import { useInspectShortcuts } from '#/components/inspect/use-shortcuts'
import { useSpanSearch } from '#/components/inspect/use-span-search'
import { type InspectView, InspectViewBar } from '#/components/inspect/view-bar'
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
import { useInspectAutoRefresh } from '#/hooks/use-auto-refresh'
import { buildInspectorView } from '#/lib/inspector-view'
import { categorizeFromSpans } from '#/lib/telemetry/trace-category'
import { parse, type TimeRange } from '#/lib/time-range'
import { sessionQuery } from './-data'

export const Route = createFileRoute('/sessions/$sessionId')({
  validateSearch: (search: Record<string, unknown>): SessionSearch => ({
    range: parse(search.range),
    view: parseSessionView(search.view) ?? 'conversation',
    span: parseSpanParam(search.span),
    session: parseSpanParam(search.session),
    trace: parseSpanParam(search.trace),
  }),
  loaderDeps: ({ search }) => ({ range: search.range }),
  loader: ({ context, params, deps }) =>
    context.queryClient.ensureQueryData(sessionQuery(params.sessionId, deps.range)),
  component: SessionDetail,
})

interface SessionSearch {
  range: TimeRange
  view: InspectView
  span?: string
  // Pass-through for the root-level drawer (?session=, ?trace=) so clicking
  // a Recent sidebar entry from inside this page actually opens the drawer.
  session?: string
  trace?: string
}

function parseSessionView(value: unknown): InspectView | undefined {
  if (value === 'conversation') return 'conversation'
  if (value === 'spans') return 'spans'
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
  const [autoRefresh, setAutoRefresh] = useInspectAutoRefresh()
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

  const inspectView = search.view

  const spans = data?.spans ?? []
  const source = data?.source ?? null
  const provider = data?.provider
  const fingerprint = data?.fingerprint
  const crumbLabel = data?.title?.trim() || sessionId

  const inspectorView = useMemo(() => buildInspectorView(spans), [spans])
  const raw = useRawRoots(inspectorView)
  const category = useMemo(() => (spans.length > 0 ? categorizeFromSpans(spans) : undefined), [spans])
  const isUtility = category === 'utility'
  const hiddenTabs = useMemo<InspectView[] | undefined>(() => (isUtility ? ['conversation'] : undefined), [isUtility])

  // Redirect utility traces to Spans view when no explicit ?view= was provided by the user.
  const [hasRedirected, setHasRedirected] = useState(false)
  useEffect(() => {
    if (isUtility && search.view === 'conversation' && !hasRedirected) {
      setHasRedirected(true)
      const chatSpan = spans.find((s) => s.operation === 'chat')
      navigate({
        search: (prev) => ({ range: prev.range, view: 'spans' as const, ...(chatSpan ? { span: chatSpan.id } : {}) }),
        replace: true,
      })
    }
  }, [isUtility, search.view, hasRedirected, spans, navigate])

  const setInspectView = (view: InspectView) => {
    navigate({
      search: (prev) => ({
        range: prev.range,
        view,
        ...(typeof prev.span === 'string' && prev.span.length > 0 ? { span: prev.span } : {}),
      }),
    })
  }

  useSpanSearch({
    view: inspectorView,
    onSelect: (id) => {
      setSelectedId(id)
      navigate({ search: (prev) => ({ range: prev.range, view: 'spans' as const, span: id }) })
    },
  })

  const [pageLink, setPageLink] = useState('')
  // biome-ignore lint/correctness/useExhaustiveDependencies: re-read href whenever the route's search params change
  useEffect(() => {
    if (typeof window !== 'undefined') setPageLink(window.location.href)
  }, [search])
  useInspectShortcuts({ entityId: sessionId, link: pageLink || undefined })

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
                  <BreadcrumbPage className={data?.title ? undefined : 'truncate font-mono'} title={sessionId}>
                    {crumbLabel}
                  </BreadcrumbPage>
                </BreadcrumbItem>
              </BreadcrumbList>
            </Breadcrumb>
            <CopyButton value={sessionId} label="Copy session id" />
            {source === 'trace' && (
              <Badge
                variant="warning"
                title="No session.id attribute on the spans — this session is a single trace. Multi-turn stitching is off."
              >
                single trace
              </Badge>
            )}
            {provider === 'openobserve' && (
              <Badge variant="success">
                via {provider} · {fingerprint}
              </Badge>
            )}
          </div>
        }
      />

      <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
        <InspectViewBar
          view={inspectView}
          onViewChange={setInspectView}
          rawAllOn={raw.rawAllOn}
          onToggleRawAll={raw.toggleAll}
          autoRefresh={autoRefresh}
          onAutoRefreshChange={setAutoRefresh}
          onRefresh={() => {
            void refetch()
          }}
          refreshing={isFetching}
          hiddenTabs={hiddenTabs}
          extras={inspectView === 'conversation' && spans.length > 0 ? <ContextWindow view={inspectorView} /> : null}
        />
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
            <InspectLayout
              view={inspectorView}
              loading={false}
              selectedId={selectedId}
              onSelect={setSelectedId}
              rawRoots={raw.rawRoots}
              onToggleRawRoot={raw.toggleRoot}
              onEnsureRawRoot={raw.ensureRoot}
            />
          ) : inspectView === 'conversation' ? (
            <ConversationView view={inspectorView} onSelect={setSelectedId} />
          ) : null}
        </div>
      </div>
    </div>
  )
}
