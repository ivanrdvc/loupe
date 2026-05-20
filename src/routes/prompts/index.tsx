import { Add01Icon, Edit02Icon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { queryOptions, useQuery } from '@tanstack/react-query'
import { createFileRoute, Link } from '@tanstack/react-router'
import { useMemo, useState } from 'react'
import { Page } from '#/components/page'
import { Avatar, AvatarFallback } from '#/components/ui/avatar'
import { Badge } from '#/components/ui/badge'
import { Button } from '#/components/ui/button'
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '#/components/ui/empty'
import { Item, ItemActions, ItemContent, ItemDescription, ItemGroup, ItemMedia, ItemTitle } from '#/components/ui/item'
import { Skeleton } from '#/components/ui/skeleton'
import { Tabs, TabsList, TabsTrigger } from '#/components/ui/tabs'
import { useUser } from '#/hooks/use-user'
import { initialsFor } from '#/lib/current-user'
import { formatAgo } from '#/lib/format'
import { queryKeys } from '#/lib/query-keys'
import { NewPromptDialog } from './-components/new-prompt-dialog'
import { listPrompts } from './-mock-data'
import type { Prompt } from './-types'

export const promptsListQuery = () =>
  queryOptions({
    queryKey: queryKeys.prompts.list(),
    queryFn: () => listPrompts(),
  })

export const Route = createFileRoute('/prompts/')({
  loader: ({ context }) => context.queryClient.ensureQueryData(promptsListQuery()),
  component: PromptsListPage,
})

type Scope = 'all' | 'mine'

function latestOf(prompt: Prompt) {
  return prompt.versions[prompt.versions.length - 1]
}

function PromptsListPage() {
  const { data: prompts = [], isLoading } = useQuery(promptsListQuery())
  const [dialogOpen, setDialogOpen] = useState(false)
  const [scope, setScope] = useState<Scope>('all')
  const user = useUser()

  const filtered = useMemo(() => {
    if (scope === 'all') return prompts
    return prompts.filter((p) => latestOf(p)?.author === user.name)
  }, [prompts, scope, user.name])

  return (
    <Page title="Prompts">
      <div className="flex flex-col gap-4 px-4 lg:px-6">
        <div className="flex items-center justify-end gap-2">
          <Tabs value={scope} onValueChange={(v) => setScope(v as Scope)}>
            <TabsList>
              <TabsTrigger value="all">All</TabsTrigger>
              <TabsTrigger value="mine">Mine</TabsTrigger>
            </TabsList>
          </Tabs>
          <Button onClick={() => setDialogOpen(true)}>
            <HugeiconsIcon icon={Add01Icon} data-icon="inline-start" />
            New prompt
          </Button>
        </div>

        {isLoading ? (
          <PromptListSkeleton />
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
        ) : filtered.length === 0 ? (
          <Empty>
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <HugeiconsIcon icon={Edit02Icon} />
              </EmptyMedia>
              <EmptyTitle>None of yours</EmptyTitle>
              <EmptyDescription>You haven't authored a prompt yet. Switch to All to see the rest.</EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : (
          <PromptList prompts={filtered} />
        )}
      </div>
      <NewPromptDialog open={dialogOpen} onOpenChange={setDialogOpen} />
    </Page>
  )
}

function PromptList({ prompts }: { prompts: Prompt[] }) {
  return (
    <ItemGroup>
      {prompts.map((prompt) => {
        const latest = latestOf(prompt)
        const model = latest?.modelParams.model ?? '—'
        return (
          <Item key={prompt.id} variant="outline" asChild>
            <Link to="/prompts/$promptId" params={{ promptId: prompt.id }}>
              <ItemMedia variant="icon">
                <HugeiconsIcon icon={Edit02Icon} strokeWidth={2} />
              </ItemMedia>
              <ItemContent>
                <ItemTitle>{prompt.name}</ItemTitle>
                {prompt.description ? <ItemDescription>{prompt.description}</ItemDescription> : null}
              </ItemContent>
              <ItemActions className="gap-3 text-xs text-muted-foreground">
                <Badge variant="outline" className="font-mono text-[11px]">
                  {model}
                </Badge>
                <Badge variant="secondary" className="font-mono">
                  v{latest?.version ?? 1}
                </Badge>
                <span className="hidden tabular-nums sm:inline">{formatAgo(prompt.updatedAt)}</span>
                <Avatar size="sm" className="hidden sm:flex">
                  <AvatarFallback>{initialsFor(latest?.author ?? 'ivan')}</AvatarFallback>
                </Avatar>
              </ItemActions>
            </Link>
          </Item>
        )
      })}
    </ItemGroup>
  )
}

function PromptListSkeleton() {
  return (
    <ItemGroup>
      {Array.from({ length: 4 }).map((_, i) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: skeleton items have no stable key
        <Item key={i} variant="outline">
          <ItemMedia variant="icon">
            <Skeleton className="size-4" />
          </ItemMedia>
          <ItemContent>
            <Skeleton className="h-4 w-40" />
            <Skeleton className="h-3 w-72" />
          </ItemContent>
          <ItemActions>
            <Skeleton className="h-5 w-16" />
            <Skeleton className="h-5 w-10" />
          </ItemActions>
        </Item>
      ))}
    </ItemGroup>
  )
}
