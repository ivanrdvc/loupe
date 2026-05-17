import {
  ArrowTopRightOnSquareIcon,
  BoltIcon,
  ChevronDownIcon,
  ClockIcon,
  CubeTransparentIcon,
  ExclamationTriangleIcon,
  InboxArrowDownIcon,
  SparklesIcon,
} from '@heroicons/react/20/solid'
import { useQuery } from '@tanstack/react-query'
import { createFileRoute, Link, useNavigate } from '@tanstack/react-router'
import { useEffect, useState } from 'react'
import { ChartAreaInteractive } from '#/components/chart-area-interactive'
import { EnvSelect } from '#/components/env-select'
import { Page } from '#/components/page'
import { TimeRangeSelect } from '#/components/time-range-select'
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '#/components/ui/empty'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '#/components/ui/table'
import { ToggleGroup, ToggleGroupItem } from '#/components/ui/toggle-group'
import { useEnv } from '#/hooks/use-env'
import { formatAgo, formatDuration } from '#/lib/format'
import type { LatencyRow } from '#/lib/telemetry'
import { HOME_RANGE_DAYS, type HomeRangeDays, homeQuery, parseHomeRangeDays } from './-home-data'

interface HomeSearch {
  days?: HomeRangeDays
}

const PREVIEW_ROWS = 5

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
    days: search.days == null ? undefined : parseHomeRangeDays(search.days),
  }),
  loaderDeps: ({ search }) => ({ days: search.days ?? 7 }),
  loader: ({ context, deps }) => context.queryClient.ensureQueryData(homeQuery(deps.days)),
  component: Home,
})

function Home() {
  const search = Route.useSearch()
  const navigate = useNavigate({ from: Route.fullPath })
  const days = search.days ?? 7
  const { data } = useQuery(homeQuery(days))
  const newTools = data?.newTools ?? []
  const newAgents = data?.newAgents ?? []
  const generationLatency = data?.generationLatency ?? []
  const observationLatency = data?.observationLatency ?? []

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

  const setDays = (days: HomeRangeDays) => {
    navigate({
      replace: true,
      search: (prev) => ({ ...prev, days: days === 7 ? undefined : days }),
    })
  }

  const showAll = category === 'all'
  const signals = showAll || category === 'signals'
  const performance = showAll || category === 'performance'
  const inventory = showAll || category === 'inventory'

  return (
    <Page title="Home">
      <div className="px-4 lg:px-6">
        <ChartAreaInteractive />
      </div>
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
          <TimeRangeSelect value={days} onChange={setDays} options={HOME_RANGE_DAYS} />
        </div>
      </div>

      {signals && (
        <CategoryGroup label="Signals" showLabel={showAll}>
          <Section icon={InboxArrowDownIcon} title="Tools returning too much">
            <Empty>
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <InboxArrowDownIcon />
                </EmptyMedia>
                <EmptyTitle>No size anomalies yet</EmptyTitle>
                <EmptyDescription>No open payload-size alerts.</EmptyDescription>
              </EmptyHeader>
            </Empty>
          </Section>
          <Section icon={ExclamationTriangleIcon} title="Tools with high error rate">
            <Empty>
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <ExclamationTriangleIcon />
                </EmptyMedia>
                <EmptyTitle>No error-rate anomalies yet</EmptyTitle>
                <EmptyDescription>No open tool error-rate alerts.</EmptyDescription>
              </EmptyHeader>
            </Empty>
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
            {newTools.length === 0 ? (
              <SectionEmpty label="No newly observed MCP tools." />
            ) : (
              <Expandable rows={newTools}>
                {(rows) => (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Tool</TableHead>
                        <TableHead>Server</TableHead>
                        <TableHead>First seen</TableHead>
                        <TableHead />
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {rows.map((row) => (
                        <TableRow key={row.id}>
                          <TableCell className="font-mono text-xs">{row.name}</TableCell>
                          <TableCell className="text-muted-foreground">{row.namespace || 'unknown'}</TableCell>
                          <TableCell className="tabular-nums text-muted-foreground">
                            {formatAgo(row.firstSeenAtMs)}
                          </TableCell>
                          <TableCell>
                            <OpenLink traceId={row.firstSeenTraceId} />
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </Expandable>
            )}
          </Section>
          <Section icon={BoltIcon} title="New agents">
            {newAgents.length === 0 ? (
              <SectionEmpty label="No newly observed agents." />
            ) : (
              <Expandable rows={newAgents}>
                {(rows) => (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Agent</TableHead>
                        <TableHead>First seen</TableHead>
                        <TableHead>Last seen</TableHead>
                        <TableHead />
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {rows.map((row) => (
                        <TableRow key={row.id}>
                          <TableCell className="font-medium">{row.name}</TableCell>
                          <TableCell className="tabular-nums text-muted-foreground">
                            {formatAgo(row.firstSeenAtMs)}
                          </TableCell>
                          <TableCell className="tabular-nums text-muted-foreground">
                            {formatAgo(row.lastSeenAtMs)}
                          </TableCell>
                          <TableCell>
                            <OpenLink traceId={row.firstSeenTraceId} />
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </Expandable>
            )}
          </Section>
        </CategoryGroup>
      )}
    </Page>
  )
}

function CategoryGroup({
  label,
  showLabel,
  children,
}: {
  label: string
  showLabel: boolean
  children: React.ReactNode
}) {
  return (
    <div className="flex flex-col gap-2 px-4 lg:px-6">
      {showLabel && (
        <h2 className="text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">{label}</h2>
      )}
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">{children}</div>
    </div>
  )
}

function LatencyTable({ rows, firstHeader }: { rows: LatencyRow[]; firstHeader: string }) {
  if (rows.length === 0) return <SectionEmpty label="No spans in this window." />
  return (
    <Expandable rows={rows}>
      {(visible) => (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{firstHeader}</TableHead>
              <TableHead className="w-16 text-right tabular-nums">p50</TableHead>
              <TableHead className="w-16 text-right tabular-nums">p90</TableHead>
              <TableHead className="w-16 text-right tabular-nums">p95 ▼</TableHead>
              <TableHead className="w-16 text-right tabular-nums">p99</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {visible.map((row) => (
              <TableRow key={row.name}>
                <TableCell className="max-w-0 truncate font-mono text-xs" title={row.name}>
                  {row.name}
                </TableCell>
                <TableCell className="text-right tabular-nums text-muted-foreground">
                  {formatDuration(row.p50Ms)}
                </TableCell>
                <TableCell className="text-right tabular-nums text-muted-foreground">
                  {formatDuration(row.p90Ms)}
                </TableCell>
                <TableCell className="text-right tabular-nums text-muted-foreground">
                  {formatDuration(row.p95Ms)}
                </TableCell>
                <TableCell className="text-right tabular-nums text-muted-foreground">
                  {formatDuration(row.p99Ms)}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </Expandable>
  )
}

function Expandable<T>({ rows, children }: { rows: T[]; children: (visible: T[]) => React.ReactNode }) {
  const [expanded, setExpanded] = useState(false)
  const hasMore = rows.length > PREVIEW_ROWS
  const visible = expanded || !hasMore ? rows : rows.slice(0, PREVIEW_ROWS)
  return (
    <>
      {children(visible)}
      {hasMore && (
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="mt-2 inline-flex cursor-pointer items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground"
        >
          <ChevronDownIcon className={`size-3.5 transition-transform ${expanded ? 'rotate-180' : ''}`} />
          {expanded ? 'Show less' : `Show more (${rows.length - PREVIEW_ROWS})`}
        </button>
      )}
    </>
  )
}

function Section({
  icon: Icon,
  title,
  children,
}: {
  icon: React.ComponentType<{ className?: string }>
  title: string
  children: React.ReactNode
}) {
  return (
    <section className="rounded-lg border bg-card p-3">
      <div className="flex items-center gap-2 pb-2">
        <Icon className="size-4 fill-primary" />
        <h2 className="text-sm font-semibold text-foreground">{title}</h2>
      </div>
      {children}
    </section>
  )
}

function SectionEmpty({ label }: { label: string }) {
  return <div className="py-4 text-center text-xs text-muted-foreground">{label}</div>
}

function OpenLink({ traceId }: { traceId?: string | null }) {
  const cls = 'inline-flex items-center text-muted-foreground hover:text-foreground'
  if (traceId) {
    return (
      <Link to="/runs/$runId" params={{ runId: traceId }} className={cls} aria-label="Open run">
        <ArrowTopRightOnSquareIcon className="size-3.5" />
      </Link>
    )
  }
  return (
    <Link to="/sessions" search={{ days: 1 }} className={cls} aria-label="Open sessions">
      <ArrowTopRightOnSquareIcon className="size-3.5" />
    </Link>
  )
}
