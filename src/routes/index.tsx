import { useQuery } from '@tanstack/react-query'
import { createFileRoute, Link } from '@tanstack/react-router'
import { Page } from '#/components/page'
import { CacheAreaChart } from './-home-charts/cache-area'
import { LatencyAreaChart } from './-home-charts/latency-area'
import { ThroughputAreaChart } from './-home-charts/throughput-area'
import { NewAgentsTable, NewToolsTable, Section, ToolErrorTable, ToolPayloadTable } from './-home-components'
import { homeInboxQuery } from './-home-data'

function ViewAllToolsLink({ sort }: { sort?: 'p95Chars' | 'errorRate' | 'lastSeenMs' | 'calls' }) {
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
  loader: ({ context }) => context.queryClient.ensureQueryData(homeInboxQuery()),
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
          title="Tools returning too much"
          description="Top by p95 result size. Target: <2k tokens per call to keep context lean."
          action={<ViewAllToolsLink sort="p95Chars" />}
        >
          <ToolPayloadTable rows={toolPayloads} />
        </Section>
        <Section
          title="Tools with high error rate"
          description="Top by error rate. Target: <1% per tool."
          action={<ViewAllToolsLink sort="errorRate" />}
        >
          <ToolErrorTable rows={toolErrors} />
        </Section>
        <LatencyAreaChart />
        <CacheAreaChart />
        <ThroughputAreaChart />
        <Section
          title="New MCP tools"
          description="First seen in this window"
          action={<ViewAllToolsLink sort="lastSeenMs" />}
        >
          <NewToolsTable rows={newTools} />
        </Section>
        <Section title="New agents" description="First seen in this window">
          <NewAgentsTable rows={newAgents} />
        </Section>
      </div>
    </Page>
  )
}
