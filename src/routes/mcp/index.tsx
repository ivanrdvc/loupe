import { CubeTransparentIcon } from '@heroicons/react/24/outline'
import { useQuery } from '@tanstack/react-query'
import { createFileRoute } from '@tanstack/react-router'
import { Page } from '#/components/page'
import { Badge } from '#/components/ui/badge'
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '#/components/ui/empty'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '#/components/ui/table'
import { formatAgo } from '#/lib/format'
import { mcpQuery } from './-data'

export const Route = createFileRoute('/mcp/')({
  loader: ({ context }) => context.queryClient.ensureQueryData(mcpQuery()),
  component: McpPage,
})

function McpPage() {
  const { data } = useQuery(mcpQuery())
  const servers = data?.servers ?? []
  const findings = data?.findings ?? []

  return (
    <Page
      title="MCP"
      actions={
        <>
          {data?.partial && <Badge variant="warning">partial</Badge>}
          {data && <span className="text-xs text-muted-foreground">fetched {formatAgo(data.fetchedAt)}</span>}
        </>
      }
    >
      {servers.length === 0 ? (
        <div className="px-4 lg:px-6">
          <Empty>
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <CubeTransparentIcon />
              </EmptyMedia>
              <EmptyTitle>No MCP servers</EmptyTitle>
              <EmptyDescription>No registry references were returned.</EmptyDescription>
            </EmptyHeader>
          </Empty>
        </div>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Server</TableHead>
              <TableHead>Owner</TableHead>
              <TableHead className="text-right">Tools</TableHead>
              <TableHead className="text-right">Findings</TableHead>
              <TableHead>Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {servers.map((server) => {
              const serverFindings = findings.filter((finding) => finding.serverId === server.id)
              const owner = server.ownerTeam ?? server.ownerContact ?? 'unowned'
              return (
                <TableRow key={server.id}>
                  <TableCell>
                    <div className="flex min-w-0 flex-col">
                      <span className="font-medium">{server.name}</span>
                      <span className="truncate font-mono text-xs text-muted-foreground">
                        {server.endpoint ?? server.source}
                      </span>
                    </div>
                  </TableCell>
                  <TableCell className="text-muted-foreground">{owner}</TableCell>
                  <TableCell className="text-right tabular-nums">{server.tools.length}</TableCell>
                  <TableCell className="text-right tabular-nums">{serverFindings.length}</TableCell>
                  <TableCell>
                    <Status status={server.fetchStatus} />
                  </TableCell>
                </TableRow>
              )
            })}
          </TableBody>
        </Table>
      )}
    </Page>
  )
}

function Status({ status }: { status: 'ok' | 'error' | 'skipped' }) {
  const variant = { ok: 'success', error: 'destructive', skipped: 'secondary' } as const
  return <Badge variant={variant[status]}>{status}</Badge>
}
