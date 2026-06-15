import { useQuery } from '@tanstack/react-query'
import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { useMemo } from 'react'
import type { FacetedFilterSpec } from '#/components/data-table-toolbar'
import { Page } from '#/components/page'
import { RelativeTime } from '#/components/relative-time'
import { Badge } from '#/components/ui/badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '#/components/ui/tabs'
import { mcpQuery } from './-data'
import { LintFindings } from './-lint-findings'
import { McpDataTable } from './-mcp-data-table'
import { McpStats } from './-mcp-stats'
import { serverColumns } from './-servers-columns'
import { ToolsBrowser } from './-tools-browser'

type TabValue = 'servers' | 'tools' | 'lint'

const SERVER_FILTERS: FacetedFilterSpec[] = [
  {
    columnId: 'transport',
    title: 'Transport',
    options: [
      { label: 'streamable-http', value: 'streamable-http' },
      { label: 'sse', value: 'sse' },
      { label: 'stdio', value: 'stdio' },
      { label: 'unknown', value: 'unknown' },
    ],
  },
  {
    columnId: 'fetchStatus',
    title: 'Status',
    options: [
      { label: 'ok', value: 'ok' },
      { label: 'error', value: 'error' },
      { label: 'skipped', value: 'skipped' },
    ],
  },
]

export const Route = createFileRoute('/mcp/')({
  validateSearch: (search: Record<string, unknown>): { tab?: TabValue } => {
    const tab = search.tab
    return tab === 'tools' || tab === 'lint' ? { tab } : {}
  },
  loader: ({ context }) => context.queryClient.ensureQueryData(mcpQuery()),
  component: McpPage,
})

function McpPage() {
  const { tab } = Route.useSearch()
  const navigate = useNavigate({ from: Route.fullPath })
  const activeTab: TabValue = tab ?? 'servers'

  const { data, isLoading, isFetching, refetch } = useQuery(mcpQuery())
  const servers = data?.servers ?? []
  const findings = data?.findings ?? []
  const serverCols = useMemo(() => serverColumns(findings), [findings])
  const refresh = () => {
    void refetch()
  }

  const meta = data ? (
    <>
      {data.partial && <Badge variant="warning">partial</Badge>}
      <span className="text-xs text-muted-foreground">
        fetched <RelativeTime ts={data.fetchedAt} />
      </span>
    </>
  ) : null

  return (
    <Page title="MCP">
      <McpStats servers={servers} findings={findings} />
      <Tabs
        value={activeTab}
        onValueChange={(v) =>
          void navigate({
            search: (prev) => ({ ...prev, tab: v === 'servers' ? undefined : (v as TabValue) }),
            replace: true,
          })
        }
        className="flex min-h-0 flex-1 flex-col gap-0"
      >
        <div className="border-b">
          <TabsList variant="line" className="h-auto gap-x-4 px-4 lg:px-6">
            <TabsTrigger value="servers" className="flex-none px-3 pb-2">
              Servers
            </TabsTrigger>
            <TabsTrigger value="tools" className="flex-none px-3 pb-2">
              Tools
            </TabsTrigger>
            <TabsTrigger value="lint" className="flex-none px-3 pb-2">
              Lint
            </TabsTrigger>
          </TabsList>
        </div>
        <TabsContent value="servers" className="flex min-h-0 flex-1 flex-col">
          <McpDataTable
            columns={serverCols}
            data={servers}
            getRowId={(s) => s.id}
            searchColumnId="name"
            searchPlaceholder="Filter servers…"
            filters={SERVER_FILTERS}
            emptyMessage="No MCP servers in the registry."
            isLoading={isLoading}
            onRefresh={refresh}
            refreshing={isFetching}
            toolbarActions={meta}
          />
        </TabsContent>
        <TabsContent value="tools" className="flex min-h-0 flex-1 flex-col">
          <ToolsBrowser servers={servers} />
        </TabsContent>
        <TabsContent value="lint" className="flex min-h-0 flex-1 flex-col">
          <LintFindings findings={findings} />
        </TabsContent>
      </Tabs>
    </Page>
  )
}
