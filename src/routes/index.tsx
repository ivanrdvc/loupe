import {
  BoltIcon,
  ChartBarIcon,
  CubeTransparentIcon,
  ExclamationTriangleIcon,
  InboxArrowDownIcon,
  SparklesIcon,
} from '@heroicons/react/20/solid'
import { useQuery } from '@tanstack/react-query'
import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { EnvSelect } from '#/components/env-select'
import { Page } from '#/components/page'
import { RefreshingIndicator } from '#/components/refreshing-indicator'
import { TimeRangeSelect } from '#/components/time-range-select'
import { useEnv } from '#/hooks/use-env'
import { DEFAULT, parse, type TimeRange } from '#/lib/time-range'
import { CacheAreaChart } from './-home-charts/cache-area'
import { LatencyAreaChart } from './-home-charts/latency-area'
import { ThroughputAreaChart } from './-home-charts/throughput-area'
import { NewAgentsTable, NewToolsTable, Section, ToolErrorTable, ToolPayloadTable } from './-home-components'
import { homeQuery } from './-home-data'

interface HomeSearch {
  range?: TimeRange
}

export const Route = createFileRoute('/')({
  validateSearch: (search: Record<string, unknown>): HomeSearch => ({
    range: search.range == null ? undefined : parse(search.range),
  }),
  loaderDeps: ({ search }) => ({ range: search.range ?? DEFAULT }),
  loader: ({ context, deps }) => context.queryClient.ensureQueryData(homeQuery(deps.range)),
  component: Home,
})

function Home() {
  const search = Route.useSearch()
  const navigate = useNavigate({ from: Route.fullPath })
  const range = search.range ?? DEFAULT
  const { data, isFetching } = useQuery(homeQuery(range))
  const newTools = data?.newTools ?? []
  const newAgents = data?.newAgents ?? []
  const toolErrors = data?.toolErrors ?? []
  const toolPayloads = data?.toolPayloads ?? []
  const chatLatencyOverTime = data?.chatLatencyOverTime ?? []
  const cacheHitRateOverTime = data?.cacheHitRateOverTime ?? []
  const runsPerHour = data?.runsPerHour ?? []

  const [env, setEnv] = useEnv()

  const setRange = (next: TimeRange) => {
    navigate({
      replace: true,
      search: (prev) => ({ ...prev, range: next === DEFAULT ? undefined : next }),
    })
  }

  return (
    <Page title="Home">
      <div className="flex flex-wrap items-center gap-2 px-4 lg:px-6">
        <div className="ml-auto flex flex-wrap items-center gap-2">
          <RefreshingIndicator active={isFetching} />
          <EnvSelect value={env} onChange={setEnv} />
          <TimeRangeSelect value={range} onChange={setRange} />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 px-4 lg:px-6 xl:grid-cols-2">
        <Section icon={InboxArrowDownIcon} title="Tools returning too much">
          <ToolPayloadTable rows={toolPayloads} />
        </Section>
        <Section icon={ExclamationTriangleIcon} title="Tools with high error rate">
          <ToolErrorTable rows={toolErrors} />
        </Section>
        <Section icon={SparklesIcon} title="Chat latency over time — p50 / p95 + call volume" wide>
          <LatencyAreaChart data={chatLatencyOverTime} />
        </Section>
        <Section icon={ChartBarIcon} title="Cache-hit rate over time">
          <CacheAreaChart data={cacheHitRateOverTime} />
        </Section>
        <Section icon={ChartBarIcon} title="Runs over time">
          <ThroughputAreaChart data={runsPerHour} />
        </Section>
        <Section icon={CubeTransparentIcon} title="New MCP tools">
          <NewToolsTable rows={newTools} />
        </Section>
        <Section icon={BoltIcon} title="New agents">
          <NewAgentsTable rows={newAgents} />
        </Section>
      </div>
    </Page>
  )
}
