import { queryOptions, useQuery } from '@tanstack/react-query'
import { createFileRoute } from '@tanstack/react-router'
import { useMemo, useState } from 'react'
import { Page } from '#/components/page'
import { PageBreadcrumb } from '#/components/page-breadcrumb'
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '#/components/ui/empty'
import { Skeleton } from '#/components/ui/skeleton'
import { getPrompt } from '#/features/inventory/system-prompts/server'
import type { PromptWithVersions } from '#/features/inventory/system-prompts/types'
import { NoteSheetButton } from '#/features/notes'
import { queryKeys } from '#/lib/query-keys'
import { PromptDetailMeta } from './-components/prompt-detail-header'
import { PromptEditor } from './-components/prompt-editor'
import { VersionList } from './-components/version-list'

const promptQuery = (id: number) =>
  queryOptions({
    queryKey: queryKeys.prompts.detail(id),
    queryFn: () => getPrompt({ data: { promptId: id } }),
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
              <EmptyTitle>Prompt not found</EmptyTitle>
              <EmptyDescription>This prompt may have been removed.</EmptyDescription>
            </EmptyHeader>
          </Empty>
        </div>
      </Page>
    )
  }

  return <SystemPromptDetailLoaded key={data.prompt.id} data={data} />
}

function SystemPromptBreadcrumb({ name }: { name?: string }) {
  return (
    <PageBreadcrumb crumbs={[{ label: 'System Prompts', to: '/inventory/system-prompts' }, { label: name ?? '—' }]} />
  )
}

function SystemPromptDetailLoaded({ data }: { data: PromptWithVersions }) {
  const { prompt, versions } = data
  const sorted = useMemo(() => [...versions].sort((a, b) => b.version - a.version), [versions])
  const latest = sorted[0]
  const [activeVersionId, setActiveVersionId] = useState<number>(latest?.id ?? 0)
  const activeVersion = useMemo(
    () => versions.find((v) => v.id === activeVersionId) ?? latest,
    [versions, activeVersionId, latest],
  )
  const isLatest = activeVersion?.id === latest?.id

  return (
    <Page title={<SystemPromptBreadcrumb name={prompt.name} />}>
      <div className="flex flex-col">
        <div className="flex flex-wrap items-center gap-3 border-b px-4 py-3 lg:px-6">
          <PromptDetailMeta
            prompt={prompt}
            latestVersion={latest}
            isLatest={isLatest}
            activeVersion={activeVersion?.version ?? 0}
            isSystem
          />
          <div className="ml-auto flex items-center gap-2">
            <NoteSheetButton targetKind="prompt" targetId={String(prompt.id)} />
          </div>
        </div>

        <div className="grid grid-cols-1 gap-0 lg:grid-cols-[1fr_320px]">
          <div className="flex flex-col gap-4 px-4 py-6 lg:px-6">
            {activeVersion?.sourceRef && (
              <div className="rounded-md border bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
                Synced from <span className="font-mono text-foreground">{activeVersion.sourceRef}</span>
              </div>
            )}
            <PromptEditor messages={activeVersion?.messages ?? []} readOnly />
          </div>
          <aside className="border-l bg-card/30 lg:sticky lg:top-0 lg:h-[calc(100vh-3.5rem)]">
            <div className="border-b px-4 py-3">
              <h2 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Versions</h2>
            </div>
            <VersionList
              versions={versions}
              activeVersionId={activeVersion?.id ?? 0}
              onSelect={setActiveVersionId}
              canCreate={false}
            />
          </aside>
        </div>
      </div>
    </Page>
  )
}
