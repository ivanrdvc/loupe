import { ChevronLeftIcon } from '@heroicons/react/16/solid'
import { useQuery } from '@tanstack/react-query'
import { createFileRoute, Link } from '@tanstack/react-router'
import { ContextWindow } from '#/components/context-window'
import { ConversationView } from '#/components/conversation-view'
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
    <div className="flex h-full min-h-[60vh] flex-col">
      <header className="flex flex-wrap items-center gap-x-3 gap-y-1 pb-3">
        <Link
          to="/runs"
          aria-label="Back to runs"
          className="-ml-1 inline-flex size-6 items-center justify-center rounded text-muted-foreground hover:bg-muted hover:text-foreground"
        >
          <ChevronLeftIcon className="size-4 fill-current" />
        </Link>
        <h1 className="text-lg font-semibold tracking-tight text-foreground">Run #{runId}</h1>
        <div className="text-xs text-muted-foreground">
          {spans[0]?.service ?? '—'} · {(total / 1000).toFixed(2)}s · {spans.length} spans
        </div>
        {provider === 'openobserve' ? (
          <span className="rounded bg-emerald-500/10 px-1.5 py-0.5 text-[10px] font-medium text-emerald-700 dark:text-emerald-300">
            via {provider} · {fingerprint}
          </span>
        ) : !provider ? (
          <span className="rounded bg-amber-500/10 px-1.5 py-0.5 text-[10px] font-medium text-amber-700 dark:text-amber-300">
            demo data
          </span>
        ) : null}
        {truncated && (
          <span className="rounded bg-rose-500/10 px-1.5 py-0.5 text-[10px] font-medium text-rose-700 dark:text-rose-300">
            truncated
          </span>
        )}
        <div className="ml-auto">
          <ContextWindow spans={spans} />
        </div>
      </header>

      <section className="min-h-0 flex-1 border-t">
        <ConversationView spans={spans} onSelect={() => {}} />
      </section>
    </div>
  )
}
