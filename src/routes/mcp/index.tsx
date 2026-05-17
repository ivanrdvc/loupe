import { CubeTransparentIcon } from '@heroicons/react/24/outline'
import { useQuery } from '@tanstack/react-query'
import { createFileRoute } from '@tanstack/react-router'
import { EmptyState } from '#/components/empty-state'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '#/components/ui/catalyst/table'
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
    <div className="flex h-full flex-col">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 pb-4">
        <h1 className="text-lg font-semibold tracking-tight text-zinc-950 dark:text-white">MCP</h1>
        {data?.partial && (
          <span className="rounded bg-rose-500/10 px-1.5 py-0.5 text-[10px] font-medium text-rose-700 dark:text-rose-300">
            partial
          </span>
        )}
        {data && <span className="text-xs text-zinc-500 dark:text-zinc-400">fetched {formatAgo(data.fetchedAt)}</span>}
      </div>

      {servers.length === 0 ? (
        <EmptyState
          icon={CubeTransparentIcon}
          title="No MCP servers"
          description="No registry references were returned."
        />
      ) : (
        <Table dense>
          <TableHead>
            <TableRow>
              <TableHeader>Server</TableHeader>
              <TableHeader>Owner</TableHeader>
              <TableHeader className="text-right">Tools</TableHeader>
              <TableHeader className="text-right">Findings</TableHeader>
              <TableHeader>Status</TableHeader>
            </TableRow>
          </TableHead>
          <TableBody>
            {servers.map((server) => {
              const serverFindings = findings.filter((finding) => finding.serverId === server.id)
              const owner = server.ownerTeam ?? server.ownerContact ?? 'unowned'
              return (
                <TableRow key={server.id}>
                  <TableCell>
                    <div className="flex min-w-0 flex-col">
                      <span className="font-medium">{server.name}</span>
                      <span className="truncate font-mono text-xs text-zinc-500 dark:text-zinc-400">
                        {server.endpoint ?? server.source}
                      </span>
                    </div>
                  </TableCell>
                  <TableCell className="text-zinc-500 dark:text-zinc-400">{owner}</TableCell>
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
    </div>
  )
}

function Status({ status }: { status: 'ok' | 'error' | 'skipped' }) {
  const classes = {
    ok: 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300',
    error: 'bg-rose-500/10 text-rose-700 dark:text-rose-300',
    skipped: 'bg-zinc-950/5 text-zinc-500 dark:bg-white/5 dark:text-zinc-400',
  }[status]

  return <span className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${classes}`}>{status}</span>
}
