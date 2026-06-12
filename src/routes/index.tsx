import { useQuery } from '@tanstack/react-query'
import { createFileRoute, Link } from '@tanstack/react-router'
import { Page } from '#/components/page'
import { ALERT_KINDS } from '#/lib/alerts/kinds'
import { CacheAreaChart } from './-home-charts/cache-area'
import { LatencyAreaChart } from './-home-charts/latency-area'
import { ThroughputAreaChart } from './-home-charts/throughput-area'
import { NewAgentsTable, NewToolsTable, Section, ToolErrorTable, ToolPayloadTable } from './-home-components'
import { cacheHitRateOverTimeQuery, chatLatencyOverTimeQuery, homeInboxQuery, runsPerHourQuery } from './-home-data'

function ViewAllToolsLink({ sort }: { sort?: 'p95Chars' | 'errorRate' | 'lastSeenMs' }) {
  return (
    <Link
      to="/tools"
      search={sort ? { sort } : {}}
      className="text-xs text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
    >
      View all →
    </Link>
  )
}

export const Route = createFileRoute('/')({
  loader: ({ context }) => {
    const qc = context.queryClient
    qc.prefetchQuery(chatLatencyOverTimeQuery())
    qc.prefetchQuery(cacheHitRateOverTimeQuery())
    qc.prefetchQuery(runsPerHourQuery())
    return qc.ensureQueryData(homeInboxQuery())
  },
  component: Home,
})

function Home() {
  const { data } = useQuery(homeInboxQuery())
  const newTools = data?.newTools ?? []
  const newAgents = data?.newAgents ?? []
  const toolErrors = data?.toolErrors ?? []
  const toolPayloads = data?.toolPayloads ?? []

  return (
    <Page title="Home">
      <div className="grid grid-cols-1 gap-4 px-4 lg:px-6 xl:grid-cols-2">
        <Section
          title={ALERT_KINDS.tool_size_p95.title}
          description={ALERT_KINDS.tool_size_p95.blurb}
          action={<ViewAllToolsLink sort="p95Chars" />}
        >
          <ToolPayloadTable rows={toolPayloads} />
        </Section>
        <Section
          title={ALERT_KINDS.tool_error_rate.title}
          description={ALERT_KINDS.tool_error_rate.blurb}
          action={<ViewAllToolsLink sort="errorRate" />}
        >
          <ToolErrorTable rows={toolErrors} />
        </Section>
        <LatencyAreaChart />
        <CacheAreaChart />
        <ThroughputAreaChart />
        <Section
          title={ALERT_KINDS.new_tool.title}
          description={ALERT_KINDS.new_tool.blurb}
          action={<ViewAllToolsLink sort="lastSeenMs" />}
        >
          <NewToolsTable rows={newTools} />
        </Section>
        <Section title={ALERT_KINDS.new_agent.title} description={ALERT_KINDS.new_agent.blurb}>
          <NewAgentsTable rows={newAgents} />
        </Section>
      </div>
    </Page>
  )
}
