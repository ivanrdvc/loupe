import { IconSearch } from '@tabler/icons-react'
import { queryOptions, useQuery } from '@tanstack/react-query'
import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { useMemo, useState } from 'react'
import { Page } from '#/components/page'
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '#/components/ui/empty'
import { Input } from '#/components/ui/input'
import { Skeleton } from '#/components/ui/skeleton'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '#/components/ui/table'
import { listSystemPrompts } from '#/features/inventory/system-prompts/server'
import { formatAgo } from '#/lib/format'
import { queryKeys } from '#/lib/query-keys'

const promptsQuery = queryOptions({
  queryKey: queryKeys.prompts.list(),
  queryFn: () => listSystemPrompts(),
})

export const Route = createFileRoute('/inventory/system-prompts/')({
  loader: ({ context }) => context.queryClient.ensureQueryData(promptsQuery),
  component: SystemPromptsListPage,
})

function SystemPromptsListPage() {
  const navigate = useNavigate()
  const { data: prompts = [], isLoading } = useQuery(promptsQuery)
  const [search, setSearch] = useState('')

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return prompts
    return prompts.filter((p) => p.name.toLowerCase().includes(q) || (p.systemPrompt ?? '').toLowerCase().includes(q))
  }, [prompts, search])

  return (
    <Page title="System Prompts">
      <div className="flex min-w-0 flex-col">
        <div className="flex flex-wrap items-center gap-2 px-4 py-3 lg:px-6">
          <div className="relative w-full min-w-0 sm:w-64">
            <IconSearch className="pointer-events-none absolute top-1/2 left-2 size-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search system prompts…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="h-8 w-full pl-7"
            />
          </div>
        </div>

        {isLoading ? (
          <div className="flex flex-col gap-2 p-4 lg:p-6">
            {Array.from({ length: 5 }).map((_, i) => (
              // biome-ignore lint/suspicious/noArrayIndexKey: skeleton placeholders
              <Skeleton key={i} className="h-10 w-full" />
            ))}
          </div>
        ) : prompts.length === 0 ? (
          <Empty>
            <EmptyHeader>
              <EmptyMedia variant="icon" />
              <EmptyTitle>No system prompts yet</EmptyTitle>
              <EmptyDescription>System prompts captured from your agents will appear here.</EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : (
          <div className="border-t bg-background">
            <Table>
              <TableHeader className="bg-muted/40 [&_th]:font-normal [&_th]:text-muted-foreground">
                <TableRow className="[&>:first-child]:pl-4 [&>:last-child]:pr-4 lg:[&>:first-child]:pl-6 lg:[&>:last-child]:pr-6">
                  <TableHead>Agent</TableHead>
                  <TableHead>System prompt</TableHead>
                  <TableHead className="whitespace-nowrap">Last seen</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={3} className="h-32 text-center text-muted-foreground">
                      No system prompts match your search.
                    </TableCell>
                  </TableRow>
                ) : (
                  filtered.map((p) => (
                    <TableRow
                      key={p.id}
                      className="cursor-pointer [&>:first-child]:pl-4 [&>:last-child]:pr-4 lg:[&>:first-child]:pl-6 lg:[&>:last-child]:pr-6"
                      onClick={() =>
                        navigate({ to: '/inventory/system-prompts/$promptId', params: { promptId: String(p.id) } })
                      }
                    >
                      <TableCell className="font-medium">{p.name}</TableCell>
                      <TableCell className="max-w-xl truncate text-muted-foreground">{p.systemPrompt}</TableCell>
                      <TableCell className="whitespace-nowrap text-muted-foreground">
                        {formatAgo(p.lastSeenAt)}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        )}
      </div>
    </Page>
  )
}
