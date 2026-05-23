import { useQuery } from '@tanstack/react-query'
import { createFileRoute, Link } from '@tanstack/react-router'
import { useEffect, useState } from 'react'
import { ContextWindow } from '#/components/context-window'
import { ConversationView } from '#/components/conversation-view'
import { InspectLayout } from '#/components/inspect/overview'
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
import type { Span } from '#/lib/spans'
import { traceSpansQuery } from './-data'

export const Route = createFileRoute('/traces/$traceId')({
  loader: ({ context, params }) => context.queryClient.ensureQueryData(traceSpansQuery(params.traceId)),
  component: TraceDetail,
})

function TraceDetail() {
  const { traceId } = Route.useParams()
  const { data: loaderData } = useQuery(traceSpansQuery(traceId))

  const spans: Span[] = loaderData?.spans ?? []
  const provider = loaderData?.provider
  const fingerprint = loaderData?.fingerprint
  const truncated = loaderData?.truncated
  const focusSpanId = loaderData?.focusSpanId

  const total = spans.length > 0 ? Math.max(...spans.map((s) => s.endMs)) - Math.min(...spans.map((s) => s.startMs)) : 0

  const [view, setView] = useState<InspectView>('spans')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [fullSpans, setFullSpans] = useState(false)

  // Auto-select the focused span (from sub-agent/purpose click), or first chat span.
  useEffect(() => {
    if (spans.length === 0) return
    if (focusSpanId && spans.some((s) => s.id === focusSpanId)) {
      setSelectedId(focusSpanId)
    } else {
      const chatSpan = spans.find((s) => s.operation === 'chat')
      setSelectedId(chatSpan?.id ?? spans[0].id)
    }
  }, [spans, focusSpanId])

  useSpanSearch({
    spans,
    fullSpans,
    onSelect: (id) => {
      setSelectedId(id)
      setView('spans')
    },
  })

  return (
    <div className="flex h-full flex-col">
      <SiteHeader
        title={
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <h1 className="sr-only">Trace {traceId}</h1>
            <Breadcrumb>
              <BreadcrumbList>
                <BreadcrumbItem>
                  <BreadcrumbLink asChild>
                    <Link to="/traces" search={(prev) => prev}>
                      Traces
                    </Link>
                  </BreadcrumbLink>
                </BreadcrumbItem>
                <BreadcrumbSeparator />
                <BreadcrumbItem>
                  <BreadcrumbPage>{traceId}</BreadcrumbPage>
                </BreadcrumbItem>
              </BreadcrumbList>
            </Breadcrumb>
            <span className="text-sm text-muted-foreground">
              {spans[0]?.service ?? '—'} · {(total / 1000).toFixed(2)}s · {spans.length} spans
            </span>
            {provider === 'openobserve' ? (
              <Badge variant="success">
                via {provider} · {fingerprint}
              </Badge>
            ) : !provider ? (
              <Badge variant="warning">no data</Badge>
            ) : null}
            {truncated && <Badge variant="destructive">truncated</Badge>}
          </div>
        }
      />
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
        <InspectViewBar
          view={view}
          onViewChange={setView}
          fullSpans={fullSpans}
          onFullSpansChange={setFullSpans}
          extras={view === 'conversation' && spans.length > 0 ? <ContextWindow spans={spans} /> : undefined}
        />
        <div className="min-h-0 flex-1 overflow-hidden bg-background">
          {view === 'conversation' ? (
            <ConversationView spans={spans} onSelect={setSelectedId} />
          ) : spans.length > 0 ? (
            <InspectLayout
              spans={spans}
              loading={false}
              selectedId={selectedId}
              onSelect={setSelectedId}
              fullSpans={fullSpans}
            />
          ) : (
            <div className="flex h-full items-center justify-center text-muted-foreground">
              No spans found for this trace.
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
