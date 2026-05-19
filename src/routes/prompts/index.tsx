import { Add01Icon, Edit02Icon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { queryOptions, useQuery } from '@tanstack/react-query'
import { createFileRoute, Link, useNavigate } from '@tanstack/react-router'
import { useState } from 'react'
import { Page } from '#/components/page'
import { Badge } from '#/components/ui/badge'
import { Button } from '#/components/ui/button'
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '#/components/ui/empty'
import { Skeleton } from '#/components/ui/skeleton'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '#/components/ui/table'
import { formatAgo } from '#/lib/format'
import { queryKeys } from '#/lib/query-keys'
import { NewPromptDialog } from './-components/new-prompt-dialog'
import { listPrompts } from './-mock-data'

export const promptsListQuery = () =>
  queryOptions({
    queryKey: queryKeys.prompts.list(),
    queryFn: () => listPrompts(),
  })

export const Route = createFileRoute('/prompts/')({
  loader: ({ context }) => context.queryClient.ensureQueryData(promptsListQuery()),
  component: PromptsListPage,
})

function PromptsListPage() {
  const navigate = useNavigate()
  const { data: prompts = [], isLoading } = useQuery(promptsListQuery())
  const [dialogOpen, setDialogOpen] = useState(false)

  return (
    <Page title="Prompts">
      <div className="flex flex-col gap-4 px-4 lg:px-6">
        <div className="flex items-center justify-between gap-2">
          <h1 className="text-lg font-semibold">Prompts</h1>
          <Button onClick={() => setDialogOpen(true)}>
            <HugeiconsIcon icon={Add01Icon} data-icon="inline-start" />
            New prompt
          </Button>
        </div>

        {isLoading ? (
          <PromptsTableSkeleton />
        ) : prompts.length === 0 ? (
          <Empty>
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <HugeiconsIcon icon={Edit02Icon} />
              </EmptyMedia>
              <EmptyTitle>No prompts yet</EmptyTitle>
              <EmptyDescription>Create one to start iterating on system messages, tools, and outputs.</EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : (
          <div className="overflow-hidden rounded-lg border">
            <Table>
              <TableHeader className="bg-muted">
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Latest</TableHead>
                  <TableHead>Updated</TableHead>
                  <TableHead>Author</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {prompts.map((prompt) => {
                  const latest = prompt.versions[prompt.versions.length - 1]
                  return (
                    <TableRow
                      key={prompt.id}
                      className="cursor-pointer"
                      onClick={() => navigate({ to: '/prompts/$promptId', params: { promptId: prompt.id } })}
                    >
                      <TableCell>
                        <Link
                          to="/prompts/$promptId"
                          params={{ promptId: prompt.id }}
                          className="flex min-w-0 flex-col gap-0.5"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <span className="font-medium text-foreground">{prompt.name}</span>
                          {prompt.description && (
                            <span className="truncate text-xs text-muted-foreground">{prompt.description}</span>
                          )}
                        </Link>
                      </TableCell>
                      <TableCell>
                        <Badge variant="secondary" className="font-mono">
                          v{latest?.version ?? 1}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-muted-foreground tabular-nums">
                        {formatAgo(prompt.updatedAt)}
                      </TableCell>
                      <TableCell className="text-muted-foreground">{latest?.author ?? '—'}</TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          </div>
        )}
      </div>
      <NewPromptDialog open={dialogOpen} onOpenChange={setDialogOpen} />
    </Page>
  )
}

function PromptsTableSkeleton() {
  return (
    <div className="overflow-hidden rounded-lg border">
      <Table>
        <TableHeader className="bg-muted">
          <TableRow>
            <TableHead>Name</TableHead>
            <TableHead>Latest</TableHead>
            <TableHead>Updated</TableHead>
            <TableHead>Author</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {Array.from({ length: 3 }).map((_, i) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: skeleton rows have no stable key
            <TableRow key={i}>
              <TableCell>
                <Skeleton className="h-4 w-40" />
              </TableCell>
              <TableCell>
                <Skeleton className="h-5 w-10" />
              </TableCell>
              <TableCell>
                <Skeleton className="h-4 w-16" />
              </TableCell>
              <TableCell>
                <Skeleton className="h-4 w-12" />
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  )
}
