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
import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { useEffect, useState } from 'react'
import { BadgeSelect } from '#/components/badge-select'
import { EmptyState } from '#/components/empty-state'
import { EnvSelect } from '#/components/env-select'
import { TimeRangeSelect } from '#/components/time-range-select'
import { Link } from '#/components/ui/catalyst/link'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '#/components/ui/catalyst/table'
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
    <div className="flex h-full flex-col gap-4">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <h1 className="text-lg font-semibold tracking-tight text-zinc-950 dark:text-white">Home</h1>
        <div className="flex flex-wrap items-center gap-2 sm:ml-auto">
          <BadgeSelect
            label="Category"
            value={category}
            options={CATEGORIES}
            onChange={setCategory}
            format={(v) => CATEGORY_LABEL[v]}
          />
          <EnvSelect value={env} onChange={setEnv} />
          <TimeRangeSelect value={days} onChange={setDays} options={HOME_RANGE_DAYS} />
        </div>
      </div>

      {signals && (
        <CategoryGroup label="Signals" showLabel={showAll}>
          <Section icon={InboxArrowDownIcon} title="Tools returning too much">
            <EmptyState
              icon={InboxArrowDownIcon}
              title="No size anomalies yet"
              description="No open payload-size alerts."
            />
          </Section>
          <Section icon={ExclamationTriangleIcon} title="Tools with high error rate">
            <EmptyState
              icon={ExclamationTriangleIcon}
              title="No error-rate anomalies yet"
              description="No open tool error-rate alerts."
            />
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
                  <Table dense>
                    <TableHead>
                      <TableRow>
                        <TableHeader>Tool</TableHeader>
                        <TableHeader>Server</TableHeader>
                        <TableHeader>First seen</TableHeader>
                        <TableHeader />
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {rows.map((row) => (
                        <TableRow key={row.id}>
                          <TableCell className="font-mono text-xs">{row.name}</TableCell>
                          <TableCell className="text-zinc-500 dark:text-zinc-400">
                            {row.namespace || 'unknown'}
                          </TableCell>
                          <TableCell className="tabular-nums text-zinc-500 dark:text-zinc-400">
                            {formatAgo(row.firstSeenAtMs)}
                          </TableCell>
                          <TableCell>
                            <OpenLink href={row.firstSeenTraceId ? `/runs/${row.firstSeenTraceId}` : '/sessions'} />
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
                  <Table dense>
                    <TableHead>
                      <TableRow>
                        <TableHeader>Agent</TableHeader>
                        <TableHeader>First seen</TableHeader>
                        <TableHeader>Last seen</TableHeader>
                        <TableHeader />
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {rows.map((row) => (
                        <TableRow key={row.id}>
                          <TableCell className="font-medium">{row.name}</TableCell>
                          <TableCell className="tabular-nums text-zinc-500 dark:text-zinc-400">
                            {formatAgo(row.firstSeenAtMs)}
                          </TableCell>
                          <TableCell className="tabular-nums text-zinc-500 dark:text-zinc-400">
                            {formatAgo(row.lastSeenAtMs)}
                          </TableCell>
                          <TableCell>
                            <OpenLink href={row.firstSeenTraceId ? `/runs/${row.firstSeenTraceId}` : '/sessions'} />
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
    </div>
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
    <div className="flex flex-col gap-2">
      {showLabel && (
        <h2 className="text-[11px] font-semibold tracking-wide text-zinc-500 uppercase dark:text-zinc-400">{label}</h2>
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
        <Table dense>
          <TableHead>
            <TableRow>
              <TableHeader>{firstHeader}</TableHeader>
              <TableHeader className="w-16 text-right tabular-nums">p50</TableHeader>
              <TableHeader className="w-16 text-right tabular-nums">p90</TableHeader>
              <TableHeader className="w-16 text-right tabular-nums">p95 ▼</TableHeader>
              <TableHeader className="w-16 text-right tabular-nums">p99</TableHeader>
            </TableRow>
          </TableHead>
          <TableBody>
            {visible.map((row) => (
              <TableRow key={row.name}>
                <TableCell className="max-w-0 truncate font-mono text-xs" title={row.name}>
                  {row.name}
                </TableCell>
                <TableCell className="text-right tabular-nums text-zinc-500 dark:text-zinc-400">
                  {formatDuration(row.p50Ms)}
                </TableCell>
                <TableCell className="text-right tabular-nums text-zinc-500 dark:text-zinc-400">
                  {formatDuration(row.p90Ms)}
                </TableCell>
                <TableCell className="text-right tabular-nums text-zinc-500 dark:text-zinc-400">
                  {formatDuration(row.p95Ms)}
                </TableCell>
                <TableCell className="text-right tabular-nums text-zinc-500 dark:text-zinc-400">
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
          className="mt-2 inline-flex cursor-pointer items-center gap-1.5 text-xs font-medium text-zinc-500 hover:text-zinc-950 dark:text-zinc-400 dark:hover:text-white"
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
    <section className="rounded-lg border border-zinc-950/5 bg-white p-3 dark:border-white/8 dark:bg-zinc-900">
      <div className="flex items-center gap-2 pb-2">
        <Icon className="size-4 fill-accent-500 dark:fill-accent-400" />
        <h2 className="text-sm font-semibold text-zinc-950 dark:text-white">{title}</h2>
      </div>
      {children}
    </section>
  )
}

function SectionEmpty({ label }: { label: string }) {
  return <div className="py-4 text-center text-xs text-zinc-500 dark:text-zinc-400">{label}</div>
}

function OpenLink({ href }: { href: string }) {
  return (
    <Link
      href={href}
      className="inline-flex items-center text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200"
      aria-label="Open"
    >
      <ArrowTopRightOnSquareIcon className="size-3.5" />
    </Link>
  )
}
