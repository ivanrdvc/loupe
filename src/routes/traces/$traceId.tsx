import { useQuery } from '@tanstack/react-query'
import { createFileRoute, Link } from '@tanstack/react-router'
import { ContextWindow } from '#/components/context-window'
import { ConversationView } from '#/components/conversation-view'
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
import { NoteEditor } from '#/routes/notes/-components/note-editor'
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

  const total = spans.length > 0 ? Math.max(...spans.map((s) => s.endMs)) - Math.min(...spans.map((s) => s.startMs)) : 0

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
        actions={spans.length > 0 ? <ContextWindow spans={spans} /> : undefined}
      />
      <section className="min-h-0 flex-1">
        {spans.length > 0 ? (
          <ConversationView spans={spans} onSelect={() => {}} />
        ) : (
          <div className="flex h-full items-center justify-center text-muted-foreground">
            No spans found for this trace.
          </div>
        )}
      </section>
      <section className="shrink-0 border-border border-t px-4 py-4 lg:px-6">
        <div className="flex max-w-3xl flex-col gap-2">
          <h3 className="text-sm font-medium">Notes</h3>
          <NoteEditor targetKind="trace" targetId={traceId} />
        </div>
      </section>
    </div>
  )
}
