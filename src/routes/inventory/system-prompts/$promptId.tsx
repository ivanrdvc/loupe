import { queryOptions, useQuery } from '@tanstack/react-query'
import { createFileRoute } from '@tanstack/react-router'
import { useState } from 'react'
import { Page } from '#/components/page'
import { PageBreadcrumb } from '#/components/page-breadcrumb'
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '#/components/ui/empty'
import { Skeleton } from '#/components/ui/skeleton'
import { getSystemPrompt } from '#/features/inventory/system-prompts/server'
import type { SystemPromptDetail } from '#/features/inventory/system-prompts/types'
import { NoteSheetButton } from '#/features/notes'
import { formatAgo } from '#/lib/format'
import { queryKeys } from '#/lib/query-keys'
import { cn } from '#/lib/utils'

const promptQuery = (id: number) =>
  queryOptions({
    queryKey: queryKeys.prompts.detail(id),
    queryFn: () => getSystemPrompt({ data: { id } }),
  })

export const Route = createFileRoute('/inventory/system-prompts/$promptId')({
  loader: ({ context, params }) => context.queryClient.ensureQueryData(promptQuery(Number(params.promptId))),
  component: SystemPromptDetailPage,
})

function SystemPromptDetailPage() {
  const { promptId } = Route.useParams()
  const { data, isLoading } = useQuery(promptQuery(Number(promptId)))

  if (isLoading) {
    return (
      <Page title={<SystemPromptBreadcrumb />}>
        <div className="flex flex-col gap-4 px-4 lg:px-6">
          <Skeleton className="h-6 w-48" />
          <Skeleton className="h-48 w-full" />
        </div>
      </Page>
    )
  }

  if (!data) {
    return (
      <Page title={<SystemPromptBreadcrumb />}>
        <div className="px-4 lg:px-6">
          <Empty>
            <EmptyHeader>
              <EmptyMedia variant="icon" />
              <EmptyTitle>Agent not found</EmptyTitle>
              <EmptyDescription>This agent may no longer be in the inventory.</EmptyDescription>
            </EmptyHeader>
          </Empty>
        </div>
      </Page>
    )
  }

  return <SystemPromptDetailLoaded key={data.entity.id} data={data} />
}

function SystemPromptBreadcrumb({ name }: { name?: string }) {
  return (
    <PageBreadcrumb crumbs={[{ label: 'System Prompts', to: '/inventory/system-prompts' }, { label: name ?? '—' }]} />
  )
}

function SystemPromptDetailLoaded({ data }: { data: SystemPromptDetail }) {
  const { entity, versions } = data
  // The live value lives on the entity; older distinct values are the history rows.
  const [activeId, setActiveId] = useState<number | null>(null)
  const active = versions.find((v) => v.id === activeId)
  const shown = active ? active.value : (entity.systemPrompt ?? '')
  const isLatest = activeId === null

  return (
    <Page title={<SystemPromptBreadcrumb name={entity.name} />}>
      <div className="flex flex-col">
        <div className="flex flex-wrap items-center gap-3 border-b px-4 py-3 lg:px-6">
          <div className="flex flex-col">
            <span className="font-medium">{entity.name}</span>
            <span className="text-xs text-muted-foreground">Last seen {formatAgo(entity.lastSeenAt)}</span>
          </div>
          <div className="ml-auto flex items-center gap-2">
            <NoteSheetButton targetKind="prompt" targetId={String(entity.id)} />
          </div>
        </div>

        <div className="grid grid-cols-1 gap-0 lg:grid-cols-[1fr_320px]">
          <div className="px-4 py-6 lg:px-6">
            <pre className="whitespace-pre-wrap rounded-md border bg-muted/40 p-4 text-sm">{shown}</pre>
          </div>
          <aside className="border-l bg-card/30 lg:sticky lg:top-0 lg:h-[calc(100vh-3.5rem)]">
            <div className="border-b px-4 py-3">
              <h2 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">History</h2>
            </div>
            <ul className="flex flex-col">
              <HistoryRow
                label="Current"
                sub={formatAgo(entity.lastSeenAt)}
                active={isLatest}
                onClick={() => setActiveId(null)}
              />
              {versions.map((v) => (
                <HistoryRow
                  key={v.id}
                  label={v.value.slice(0, 60)}
                  sub={formatAgo(v.observedAt)}
                  active={v.id === activeId}
                  onClick={() => setActiveId(v.id)}
                />
              ))}
            </ul>
          </aside>
        </div>
      </div>
    </Page>
  )
}

function HistoryRow({
  label,
  sub,
  active,
  onClick,
}: {
  label: string
  sub: string
  active: boolean
  onClick: () => void
}) {
  return (
    <li>
      <button
        type="button"
        onClick={onClick}
        className={cn(
          'flex w-full flex-col items-start gap-0.5 border-b px-4 py-2.5 text-left text-sm hover:bg-muted/50',
          active && 'bg-muted',
        )}
      >
        <span className="line-clamp-1 text-foreground">{label}</span>
        <span className="text-xs text-muted-foreground">{sub}</span>
      </button>
    </li>
  )
}
