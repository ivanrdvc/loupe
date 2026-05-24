import { PlayCircleIcon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { queryOptions, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { createFileRoute, Link, useNavigate } from '@tanstack/react-router'
import { useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'
import { Page } from '#/components/page'
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '#/components/ui/breadcrumb'
import { Button } from '#/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '#/components/ui/dialog'
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '#/components/ui/empty'
import { Input } from '#/components/ui/input'
import { Label } from '#/components/ui/label'
import { Skeleton } from '#/components/ui/skeleton'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '#/components/ui/tabs'
import { Textarea } from '#/components/ui/textarea'
import { useUser } from '#/hooks/use-user'
import { queryKeys } from '#/lib/query-keys'
import { getRunDefaults, type RunLiveOutput, runLivePrompt } from '#/server/prompt-run'
import {
  createVersion,
  deletePrompt,
  getPrompt,
  listFolders,
  updatePromptMeta,
  updateRunConfig,
} from '#/server/prompts'
import { DuplicatePromptDialog } from './-components/duplicate-prompt-dialog'
import { ModelParamsPanel } from './-components/model-params-panel'
import { PromptDetailActions, PromptDetailMeta } from './-components/prompt-detail-header'
import { PromptEditor } from './-components/prompt-editor'
import { ResponseFormatPanel } from './-components/response-format-panel'
import { RunResultPanel } from './-components/run-result-panel'
import { ToolsPanel } from './-components/tools-panel'
import { extractVariables, substituteVariables, VariablesPanel } from './-components/variables-panel'
import { VersionList } from './-components/version-list'
import { VersionsSheet } from './-components/versions-sheet'
import type { Message, ModelParams, PromptWithVersions, ResponseFormat, Tool } from './-types'

const promptQuery = (id: number) =>
  queryOptions({
    queryKey: queryKeys.prompts.detail(id),
    queryFn: () => getPrompt({ data: { promptId: id } }),
  })

const foldersQuery = queryOptions({
  queryKey: queryKeys.prompts.folders(),
  queryFn: () => listFolders(),
})

const runDefaultsQuery = queryOptions({
  queryKey: queryKeys.prompts.runDefaults(),
  queryFn: () => getRunDefaults(),
  staleTime: Number.POSITIVE_INFINITY,
})

export const Route = createFileRoute('/prompts/$promptId')({
  loader: ({ context, params }) =>
    Promise.all([
      context.queryClient.ensureQueryData(promptQuery(Number(params.promptId))),
      context.queryClient.ensureQueryData(foldersQuery),
      context.queryClient.ensureQueryData(runDefaultsQuery),
    ]),
  component: PromptDetailPage,
})

function PromptDetailPage() {
  const { promptId } = Route.useParams()
  const idNum = Number(promptId)
  const { data, isLoading } = useQuery(promptQuery(idNum))

  if (isLoading) {
    return (
      <Page title={<PromptBreadcrumb />}>
        <div className="flex flex-col gap-4 px-4 lg:px-6">
          <Skeleton className="h-6 w-48" />
          <Skeleton className="h-48 w-full" />
        </div>
      </Page>
    )
  }

  if (!data) {
    return (
      <Page title={<PromptBreadcrumb />}>
        <div className="px-4 lg:px-6">
          <Empty>
            <EmptyHeader>
              <EmptyMedia variant="icon" />
              <EmptyTitle>Prompt not found</EmptyTitle>
              <EmptyDescription>This prompt may have been deleted.</EmptyDescription>
            </EmptyHeader>
          </Empty>
        </div>
      </Page>
    )
  }

  return <PromptDetailLoaded key={data.prompt.id} data={data} />
}

function PromptBreadcrumb({ name }: { name?: string }) {
  return (
    <Breadcrumb>
      <BreadcrumbList>
        <BreadcrumbItem>
          <BreadcrumbLink asChild>
            <Link to="/prompts">Prompts</Link>
          </BreadcrumbLink>
        </BreadcrumbItem>
        <BreadcrumbSeparator />
        <BreadcrumbItem>
          <BreadcrumbPage>{name ?? '—'}</BreadcrumbPage>
        </BreadcrumbItem>
      </BreadcrumbList>
    </Breadcrumb>
  )
}

function PromptDetailLoaded({ data }: { data: PromptWithVersions }) {
  const { prompt, versions, folder } = data
  const isSystem = folder?.kind === 'system'
  const queryClient = useQueryClient()
  const user = useUser()
  const { data: folders = [] } = useQuery(foldersQuery)
  const sorted = useMemo(() => [...versions].sort((a, b) => b.version - a.version), [versions])
  const latest = sorted[0]
  const [activeVersionId, setActiveVersionId] = useState<number>(latest?.id ?? 0)
  const activeVersion = useMemo(
    () => versions.find((v) => v.id === activeVersionId) ?? latest,
    [versions, activeVersionId, latest],
  )
  const isLatest = activeVersion?.id === latest?.id

  const [messages, setMessages] = useState<Message[]>(activeVersion?.messages ?? [])
  const [modelParams, setModelParams] = useState<ModelParams>(activeVersion?.modelParams ?? { model: '' })
  const [tools, setTools] = useState<Tool[]>(activeVersion?.tools ?? [])
  const [responseFormat, setResponseFormat] = useState<ResponseFormat>(
    activeVersion?.responseFormat ?? { type: 'text' },
  )

  useEffect(() => {
    if (!activeVersion) return
    setMessages(activeVersion.messages)
    setModelParams(activeVersion.modelParams)
    setTools(activeVersion.tools)
    setResponseFormat(activeVersion.responseFormat)
  }, [activeVersion])

  const hasChanges = useMemo(() => {
    if (!activeVersion || isSystem) return false
    return (
      JSON.stringify(activeVersion.messages) !== JSON.stringify(messages) ||
      JSON.stringify(activeVersion.modelParams) !== JSON.stringify(modelParams) ||
      JSON.stringify(activeVersion.tools) !== JSON.stringify(tools) ||
      JSON.stringify(activeVersion.responseFormat) !== JSON.stringify(responseFormat)
    )
  }, [activeVersion, messages, modelParams, tools, responseFormat, isSystem])

  const [discardOpen, setDiscardOpen] = useState(false)
  const [pendingVersionId, setPendingVersionId] = useState<number | null>(null)
  const [duplicateOpen, setDuplicateOpen] = useState(false)
  const [tab, setTab] = useState<string>('prompt')

  const { data: runDefaults } = useQuery(runDefaultsQuery)
  const defaultEndpoint = runDefaults?.endpointUrl ?? ''
  const defaultAgent = runDefaults?.agentName ?? ''
  const [endpointUrl, setEndpointUrl] = useState<string>(prompt.runConfig?.endpointUrl ?? defaultEndpoint)
  const [agentName, setAgentName] = useState<string>(prompt.runConfig?.agentName ?? defaultAgent)
  const [latestResult, setLatestResult] = useState<RunLiveOutput | null>(null)
  const [runError, setRunError] = useState<string | null>(null)
  const [variableValues, setVariableValues] = useState<Record<string, string>>({})

  const detectedVariables = useMemo(() => extractVariables(messages), [messages])

  const persistRunConfig = useMutation({
    mutationFn: (next: { endpointUrl: string; agentName: string }) =>
      updateRunConfig({ data: { promptId: prompt.id, endpointUrl: next.endpointUrl, agentName: next.agentName } }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.prompts.detail(prompt.id) })
    },
  })

  const handleEndpointChange = (next: string) => {
    setEndpointUrl(next)
    persistRunConfig.mutate({ endpointUrl: next, agentName })
  }

  const handleAgentChange = (next: string) => {
    setAgentName(next)
    persistRunConfig.mutate({ endpointUrl, agentName: next })
  }

  const runMutation = useMutation({
    mutationFn: () => {
      const resolved = substituteVariables(messages, variableValues)
      return runLivePrompt({
        data: { endpointUrl, agentName, messages: resolved, modelParams },
      })
    },
    onMutate: () => {
      setRunError(null)
    },
    onSuccess: (result) => {
      setLatestResult(result)
    },
    onError: (err) => {
      setRunError(err instanceof Error ? err.message : String(err))
    },
  })

  const saveMutation = useMutation({
    mutationFn: () =>
      createVersion({
        data: {
          promptId: prompt.id,
          messages,
          modelParams,
          tools,
          responseFormat,
          author: user.name,
        },
      }),
    onSuccess: async (newVersion) => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.prompts.detail(prompt.id) })
      await queryClient.invalidateQueries({ queryKey: queryKeys.prompts.all() })
      setActiveVersionId(newVersion.id)
      toast.success(`Saved as v${newVersion.version}`)
    },
  })

  const handleSelectVersion = (id: number) => {
    if (id === activeVersionId) return
    if (hasChanges) {
      setPendingVersionId(id)
      setDiscardOpen(true)
      return
    }
    setActiveVersionId(id)
  }

  const confirmDiscard = () => {
    if (pendingVersionId != null) setActiveVersionId(pendingVersionId)
    setPendingVersionId(null)
    setDiscardOpen(false)
  }

  const handleNewVersion = () => {
    if (!latest) return
    setActiveVersionId(latest.id)
  }

  const versionsSheet = !isSystem ? (
    <VersionsSheet
      versions={versions}
      activeVersionId={activeVersion?.id ?? 0}
      onSelect={handleSelectVersion}
      onNewVersion={handleNewVersion}
      canCreate
    />
  ) : null

  return (
    <Page title={<PromptBreadcrumb name={prompt.name} />}>
      <div className="flex flex-col">
        <div className="flex flex-wrap items-center gap-3 border-b px-4 py-3 lg:px-6">
          <PromptDetailMeta
            prompt={prompt}
            latestVersion={latest}
            isLatest={isLatest}
            activeVersion={activeVersion?.version ?? 0}
            isSystem={isSystem}
          />
          <div className="ml-auto flex items-center gap-2">
            <PromptDetailActions
              hasChanges={hasChanges}
              saving={saveMutation.isPending}
              isSystem={isSystem}
              onSave={() => saveMutation.mutate()}
              onDuplicate={() => setDuplicateOpen(true)}
              promptId={prompt.id}
              versionsSlot={versionsSheet}
            />
          </div>
        </div>

        {isSystem ? (
          <div className="grid grid-cols-1 gap-0 lg:grid-cols-[1fr_320px]">
            <div className="flex flex-col gap-4 px-4 py-6 lg:px-6">
              {activeVersion?.sourceRef && (
                <div className="rounded-md border bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
                  Synced from <span className="font-mono text-foreground">{activeVersion.sourceRef}</span>
                </div>
              )}
              <PromptEditor messages={messages} readOnly />
            </div>
            <aside className="border-l bg-card/30 lg:sticky lg:top-0 lg:h-[calc(100vh-3.5rem)]">
              <div className="border-b px-4 py-3">
                <h2 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Versions</h2>
              </div>
              <VersionList
                versions={versions}
                activeVersionId={activeVersion?.id ?? 0}
                onSelect={handleSelectVersion}
                canCreate={false}
              />
            </aside>
          </div>
        ) : (
          <Tabs value={tab} onValueChange={setTab} className="flex flex-1 flex-col gap-0">
            <div className="border-b pt-3">
              <TabsList variant="line" className="h-auto gap-x-4 px-4 lg:px-6">
                <TabsTrigger value="prompt" className="flex-none px-3 pb-2">
                  Prompt
                </TabsTrigger>
                <TabsTrigger value="config" className="flex-none px-3 pb-2">
                  Config
                </TabsTrigger>
                <TabsTrigger value="linked" className="flex-none px-3 pb-2">
                  Linked traces
                </TabsTrigger>
                <TabsTrigger value="settings" className="flex-none px-3 pb-2">
                  Settings
                </TabsTrigger>
              </TabsList>
            </div>
            <TabsContent value="prompt" className="flex flex-col gap-4 px-4 py-6 lg:px-6">
              <div className="flex flex-wrap items-center gap-2 rounded-lg border bg-card/40 px-3 py-2">
                <Label htmlFor="endpoint-url" className="text-xs whitespace-nowrap text-muted-foreground">
                  Endpoint
                </Label>
                <Input
                  id="endpoint-url"
                  value={endpointUrl}
                  onChange={(e) => handleEndpointChange(e.target.value)}
                  placeholder={defaultEndpoint || 'http://your-agent/v1/responses'}
                  className="h-8 max-w-xs font-mono text-xs"
                />
                <Label htmlFor="agent-name" className="text-xs whitespace-nowrap text-muted-foreground">
                  Agent
                </Label>
                <Input
                  id="agent-name"
                  value={agentName}
                  onChange={(e) => handleAgentChange(e.target.value)}
                  placeholder={defaultAgent || 'agent name'}
                  className="h-8 w-40 font-mono text-xs"
                />
                <Button
                  className="ml-auto"
                  onClick={() => runMutation.mutate()}
                  disabled={!endpointUrl.trim() || runMutation.isPending || messages.length === 0}
                >
                  <HugeiconsIcon icon={PlayCircleIcon} strokeWidth={2} data-icon="inline-start" />
                  {runMutation.isPending ? 'Running…' : 'Run'}
                </Button>
              </div>
              {detectedVariables.length > 0 && (
                <VariablesPanel variables={detectedVariables} values={variableValues} onChange={setVariableValues} />
              )}
              <PromptEditor messages={messages} onChange={setMessages} />
              {(latestResult || runMutation.isPending || runError) && (
                <div className="mt-2 border-t pt-4">
                  <RunResultPanel result={latestResult} isRunning={runMutation.isPending} error={runError} />
                </div>
              )}
            </TabsContent>

            <TabsContent value="config" className="px-4 py-6 lg:px-6">
              <div className="grid grid-cols-1 gap-8 md:grid-cols-2">
                <ModelParamsPanel value={modelParams} onChange={setModelParams} />
                <ResponseFormatPanel value={responseFormat} onChange={setResponseFormat} />
              </div>
              <div className="mt-8">
                <ToolsPanel tools={tools} onChange={setTools} />
              </div>
            </TabsContent>

            <TabsContent value="linked" className="px-4 py-6 lg:px-6">
              <Empty>
                <EmptyHeader>
                  <EmptyMedia variant="icon" />
                  <EmptyTitle>No linked traces yet</EmptyTitle>
                  <EmptyDescription>
                    Linked traces will show sessions whose first system message matches this prompt. This requires
                    telemetry — coming soon.
                  </EmptyDescription>
                </EmptyHeader>
              </Empty>
            </TabsContent>

            <TabsContent value="settings" className="px-4 py-6 lg:px-6">
              <SettingsTab prompt={prompt} />
            </TabsContent>
          </Tabs>
        )}
      </div>

      <DuplicatePromptDialog
        open={duplicateOpen}
        onOpenChange={setDuplicateOpen}
        source={prompt}
        folders={folders}
        forceUserFolder={isSystem}
      />

      <Dialog open={discardOpen} onOpenChange={setDiscardOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Discard unsaved changes?</DialogTitle>
            <DialogDescription>You have edits that aren't saved as a new version yet.</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDiscardOpen(false)}>
              Keep editing
            </Button>
            <Button variant="destructive" onClick={confirmDiscard}>
              Discard
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Page>
  )
}

function SettingsTab({ prompt }: { prompt: PromptWithVersions['prompt'] }) {
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const [name, setName] = useState(prompt.name)
  const [description, setDescription] = useState(prompt.description ?? '')
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [confirmText, setConfirmText] = useState('')

  const saveMutation = useMutation({
    mutationFn: () =>
      updatePromptMeta({
        data: { promptId: prompt.id, name: name.trim(), description: description.trim() || null },
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.prompts.detail(prompt.id) })
      await queryClient.invalidateQueries({ queryKey: queryKeys.prompts.all() })
      toast.success('Settings saved')
    },
  })

  const deleteMutation = useMutation({
    mutationFn: () => deletePrompt({ data: { promptId: prompt.id } }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.prompts.all() })
      toast.success('Prompt deleted')
      void navigate({ to: '/prompts' })
    },
  })

  return (
    <div className="flex max-w-xl flex-col gap-6">
      <section className="flex flex-col gap-4">
        <div className="flex flex-col gap-0.5">
          <h2 className="text-sm font-medium">General</h2>
          <p className="text-xs text-muted-foreground">Prompt metadata. Edits don't change the version history.</p>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="settings-name">Name</Label>
          <Input id="settings-name" value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="settings-description">Description</Label>
          <Textarea
            id="settings-description"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={3}
          />
        </div>
        <div>
          <Button size="sm" onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending}>
            {saveMutation.isPending ? 'Saving…' : 'Save'}
          </Button>
        </div>
      </section>

      <div className="flex items-center justify-between gap-4 rounded-lg border border-destructive/30 bg-destructive/[0.03] px-4 py-3">
        <div className="flex flex-col gap-0.5">
          <p className="text-sm font-medium text-destructive">Delete prompt</p>
          <p className="text-xs text-muted-foreground">Removes all versions. Cannot be undone.</p>
        </div>
        <Button variant="destructive" size="sm" onClick={() => setDeleteOpen(true)}>
          Delete
        </Button>
      </div>

      <Dialog
        open={deleteOpen}
        onOpenChange={(value) => {
          setDeleteOpen(value)
          if (!value) setConfirmText('')
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete this prompt?</DialogTitle>
            <DialogDescription>
              Type <span className="font-mono text-foreground">{prompt.name}</span> to confirm. This can't be undone.
            </DialogDescription>
          </DialogHeader>
          <Input
            value={confirmText}
            onChange={(e) => setConfirmText(e.target.value)}
            placeholder={prompt.name}
            autoFocus
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              disabled={confirmText !== prompt.name || deleteMutation.isPending}
              onClick={() => deleteMutation.mutate()}
            >
              {deleteMutation.isPending ? 'Deleting…' : 'Delete'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
