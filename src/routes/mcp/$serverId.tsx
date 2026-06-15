import { useQuery } from '@tanstack/react-query'
import { createFileRoute, redirect } from '@tanstack/react-router'
import { Puzzle } from 'lucide-react'
import { useMemo } from 'react'
import { CopyButton } from '#/components/copy-button'
import { Page } from '#/components/page'
import { PageBreadcrumb } from '#/components/page-breadcrumb'
import { Card } from '#/components/ui/card'
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '#/components/ui/empty'
import { findingsForServer } from '#/features/mcp'
import { mcpQuery } from './-data'
import { LintFindingRow } from './-lint-finding-row'
import { StatusBadge } from './-mcp-badges'
import { ToolsBrowser } from './-tools-browser'

export const Route = createFileRoute('/mcp/$serverId')({
  loader: async ({ context, params }) => {
    const data = await context.queryClient.ensureQueryData(mcpQuery())
    if (!data.servers.some((s) => s.id === params.serverId)) throw redirect({ to: '/mcp' })
    return data
  },
  component: ServerDetail,
})

function ServerDetail() {
  const { serverId } = Route.useParams()
  const { data } = useQuery(mcpQuery())
  const server = data?.servers.find((s) => s.id === serverId)
  const serverFindings = useMemo(() => findingsForServer(data?.findings ?? [], serverId), [data, serverId])

  if (!server) {
    return (
      <Page
        title={
          <PageBreadcrumb
            crumbs={[
              { label: 'MCP', to: '/mcp' },
              { label: serverId, className: 'font-mono' },
            ]}
          />
        }
      >
        <div className="px-4 lg:px-6">
          <Empty>
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <Puzzle aria-hidden />
              </EmptyMedia>
              <EmptyTitle>Server not found</EmptyTitle>
              <EmptyDescription>No registry entry with this id was returned.</EmptyDescription>
            </EmptyHeader>
          </Empty>
        </div>
      </Page>
    )
  }

  const owner = server.ownerTeam ?? server.ownerContact
  const serverLevel = serverFindings.filter((f) => !f.toolName)

  return (
    <Page
      title={
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <PageBreadcrumb crumbs={[{ label: 'MCP', to: '/mcp' }, { label: server.name }]} />
          <StatusBadge status={server.fetchStatus} />
        </div>
      }
    >
      <div className="flex min-h-0 flex-1 flex-col gap-4">
        <dl className="grid grid-cols-2 gap-x-6 gap-y-3 px-4 text-sm sm:grid-cols-4 lg:px-6">
          <Meta label="Endpoint">
            {server.endpoint ? (
              <span className="flex min-w-0 items-center gap-1">
                <span className="truncate font-mono text-xs">{server.endpoint}</span>
                <CopyButton value={server.endpoint} label="Copy endpoint" />
              </span>
            ) : (
              <span className="text-muted-foreground">—</span>
            )}
          </Meta>
          <Meta label="Owner">{owner ?? <span className="text-muted-foreground">unowned</span>}</Meta>
          <Meta label="Source">{server.source}</Meta>
          <Meta label="Tools">{server.tools.length}</Meta>
        </dl>

        {server.fetchError && <p className="px-4 text-sm text-destructive lg:px-6">{server.fetchError}</p>}

        {serverLevel.length > 0 && (
          <div className="px-4 lg:px-6">
            <Card className="gap-0 divide-y overflow-hidden p-0">
              {serverLevel.map((f) => (
                <LintFindingRow key={f.ruleId} finding={f} />
              ))}
            </Card>
          </div>
        )}

        <div className="flex min-h-0 flex-1 flex-col border-t">
          <ToolsBrowser servers={[server]} />
        </div>
      </div>
    </Page>
  )
}

function Meta({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col gap-0.5">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="min-w-0 truncate">{children}</dd>
    </div>
  )
}
