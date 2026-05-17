import {
  BoltIcon,
  ClockIcon,
  CubeTransparentIcon,
  ExclamationTriangleIcon,
  InboxArrowDownIcon,
  SparklesIcon,
} from '@heroicons/react/20/solid'
import { useQuery } from '@tanstack/react-query'
import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { useEffect, useState } from 'react'
import { EnvSelect } from '#/components/env-select'
import { Page } from '#/components/page'
import { TimeRangeSelect } from '#/components/time-range-select'
import { ToggleGroup, ToggleGroupItem } from '#/components/ui/toggle-group'
import { useEnv } from '#/hooks/use-env'
import { DEFAULT, parse, type TimeRange } from '#/lib/time-range'
import {
  CategoryGroup,
  LatencyTable,
  NewAgentsTable,
  NewToolsTable,
  Section,
  ToolErrorTable,
  ToolPayloadTable,
} from './-home-components'
import { homeQuery } from './-home-data'

interface HomeSearch {
  range?: TimeRange
}

const CATEGORIES = ['all', 'signals', 'performance', 'inventory'] as const
type Category = (typeof CATEGORIES)[number]
const CATEGORY_LABEL: Record<Category, string> = {
  all: 'All',
  signals: 'Signals',
  performance: 'Performance',
  inventory: 'Inventory',
}
const CATEGORY_STORAGE_KEY = 'home-category'
const DEFAULT_CATEGORY: Category = 'signals'

function isCategory(v: unknown): v is Category {
  return typeof v === 'string' && (CATEGORIES as readonly string[]).includes(v)
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
  const { data } = useQuery(homeQuery(range))
  const newTools = data?.newTools ?? []
  const newAgents = data?.newAgents ?? []
  const generationLatency = data?.generationLatency ?? []
  const observationLatency = data?.observationLatency ?? []
  const toolErrors = data?.toolErrors ?? []
  const toolPayloads = data?.toolPayloads ?? []
  const toolErrorsSpark = data?.toolErrorsSpark ?? []
  const toolPayloadsSpark = data?.toolPayloadsSpark ?? []

  const [env, setEnv] = useEnv()
  const [category, setCategoryState] = useState<Category>(DEFAULT_CATEGORY)
  useEffect(() => {
    const stored = window.localStorage.getItem(CATEGORY_STORAGE_KEY)
    if (isCategory(stored)) setCategoryState(stored)
  }, [])
  const setCategory = (next: Category) => {
    setCategoryState(next)
    window.localStorage.setItem(CATEGORY_STORAGE_KEY, next)
  }

  const setRange = (next: TimeRange) => {
    navigate({
      replace: true,
      search: (prev) => ({ ...prev, range: next === DEFAULT ? undefined : next }),
    })
  }

  const showAll = category === 'all'
  const signals = showAll || category === 'signals'
  const performance = showAll || category === 'performance'
  const inventory = showAll || category === 'inventory'

  return (
    <Page title="Home">
      <div className="flex flex-wrap items-center gap-2 px-4 lg:px-6">
        <ToggleGroup
          type="single"
          value={category}
          onValueChange={(v) => v && isCategory(v) && setCategory(v)}
          variant="outline"
          size="sm"
        >
          {CATEGORIES.map((c) => (
            <ToggleGroupItem key={c} value={c}>
              {CATEGORY_LABEL[c]}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
        <div className="ml-auto flex flex-wrap items-center gap-2">
          <EnvSelect value={env} onChange={setEnv} />
          <TimeRangeSelect value={range} onChange={setRange} />
        </div>
      </div>

      {signals && (
        <CategoryGroup label="Signals" showLabel={showAll}>
          <Section icon={InboxArrowDownIcon} title="Tools returning too much">
            <ToolPayloadTable rows={toolPayloads} sparks={toolPayloadsSpark} />
          </Section>
          <Section icon={ExclamationTriangleIcon} title="Tools with high error rate">
            <ToolErrorTable rows={toolErrors} sparks={toolErrorsSpark} />
          </Section>
        </CategoryGroup>
      )}

      {performance && (
        <CategoryGroup label="Performance" showLabel={showAll}>
          <Section icon={SparklesIcon} title="Generation latency percentiles">
            <LatencyTable rows={generationLatency} firstHeader="Generation" />
          </Section>
          <Section icon={ClockIcon} title="Observation latency percentiles">
            <LatencyTable rows={observationLatency} firstHeader="Observation" />
          </Section>
        </CategoryGroup>
      )}

      {inventory && (
        <CategoryGroup label="Inventory" showLabel={showAll}>
          <Section icon={CubeTransparentIcon} title="New MCP tools">
            <NewToolsTable rows={newTools} />
          </Section>
          <Section icon={BoltIcon} title="New agents">
            <NewAgentsTable rows={newAgents} />
          </Section>
        </CategoryGroup>
      )}
    </Page>
  )
}
