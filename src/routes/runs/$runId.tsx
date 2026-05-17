import { ChevronLeftIcon } from '@heroicons/react/16/solid'
import { useQuery } from '@tanstack/react-query'
import { createFileRoute, Link } from '@tanstack/react-router'
import { ContextWindow } from '#/components/context-window'
import { ConversationView } from '#/components/conversation-view'
import { SiteHeader } from '#/components/site-header'
import { Badge } from '#/components/ui/badge'
import type { Span } from '#/lib/spans'
import { RUN_SPANS, runSpansQuery } from './-data'

export const Route = createFileRoute('/runs/$runId')({
  loader: ({ context, params }) => context.queryClient.ensureQueryData(runSpansQuery(params.runId)),
  component: RunDetail,
})

function RunDetail() {
  const { runId } = Route.useParams()
  const { data: loaderData } = useQuery(runSpansQuery(runId))

  const spans: Span[] = loaderData?.spans ?? RUN_SPANS
  const provider = loaderData?.provider
  const fingerprint = loaderData?.fingerprint
  const truncated = loaderData?.truncated

  const total = Math.max(...spans.map((s) => s.endMs)) - Math.min(...spans.map((s) => s.startMs))

  return (
    <div className="flex h-full flex-col">
      <SiteHeader
        title={
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <Link
              to="/runs"
              aria-label="Back to runs"
              className="-ml-1 inline-flex size-6 items-center justify-center rounded text-muted-foreground hover:bg-muted hover:text-foreground"
            >
              <ChevronLeftIcon className="size-4 fill-current" />
            </Link>
            <h1 className="text-base font-medium">Run #{runId}</h1>
            <span className="text-xs text-muted-foreground">
              {spans[0]?.service ?? '—'} · {(total / 1000).toFixed(2)}s · {spans.length} spans
            </span>
            {provider === 'openobserve' ? (
              <Badge variant="success">
                via {provider} · {fingerprint}
              </Badge>
            ) : !provider ? (
              <Badge variant="warning">demo data</Badge>
            ) : null}
            {truncated && <Badge variant="destructive">truncated</Badge>}
          </div>
        }
        actions={<ContextWindow spans={spans} />}
      />
      <section className="min-h-0 flex-1">
        <ConversationView spans={spans} onSelect={() => {}} />
      </section>
    </div>
  )
}
