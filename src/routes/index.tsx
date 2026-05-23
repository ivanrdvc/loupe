import { useQuery } from '@tanstack/react-query'
import { createFileRoute } from '@tanstack/react-router'
import { Page } from '#/components/page'
import { CacheAreaChart } from './-home-charts/cache-area'
import { LatencyAreaChart } from './-home-charts/latency-area'
import { ThroughputAreaChart } from './-home-charts/throughput-area'
import { NewAgentsTable, NewToolsTable, Section, ToolErrorTable, ToolPayloadTable } from './-home-components'
import { homeInboxQuery } from './-home-data'

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
        <Section title="Tools returning too much">
          <ToolPayloadTable rows={toolPayloads} />
        </Section>
        <Section title="Tools with high error rate">
          <ToolErrorTable rows={toolErrors} />
        </Section>
        <LatencyAreaChart />
        <CacheAreaChart />
        <ThroughputAreaChart />
        <Section title="New MCP tools">
          <NewToolsTable rows={newTools} />
        </Section>
        <Section title="New agents">
          <NewAgentsTable rows={newAgents} />
        </Section>
      </div>
    </Page>
  )
}
