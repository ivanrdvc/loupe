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
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '#/components/ui/card'
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
import { Separator } from '#/components/ui/separator'
import { Skeleton } from '#/components/ui/skeleton'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '#/components/ui/tabs'
import { Textarea } from '#/components/ui/textarea'
import { useUser } from '#/hooks/use-user'
import { queryKeys } from '#/lib/query-keys'
import { createVersion, deletePrompt, getPrompt, updatePromptMeta } from '#/server/prompts'
import { ModelParamsPanel } from './-components/model-params-panel'
import { PromptDetailHeader } from './-components/prompt-detail-header'
import { PromptEditor } from './-components/prompt-editor'
import { ResponseFormatPanel } from './-components/response-format-panel'
import { RunResultPanel } from './-components/run-result-panel'
import { ToolsPanel } from './-components/tools-panel'
import { VersionRail } from './-components/version-rail'
import { type LiveRunOutput, runLive } from './-lib/live-run'
import type { Message, ModelParams, PromptWithVersions, ResponseFormat, Tool } from './-types'

const DEFAULT_ENDPOINT = 'http://localhost:8080/v1/responses'
const ENDPOINT_STORAGE_KEY = 'agentops.prompts.liveEndpoint'

function readStoredEndpoint(): string {
  if (typeof window === 'undefined') return DEFAULT_ENDPOINT
  return window.localStorage.getItem(ENDPOINT_STORAGE_KEY) || DEFAULT_ENDPOINT
}

const promptQuery = (id: number) =>
  queryOptions({
    queryKey: queryKeys.prompts.detail(id),
    queryFn: () => getPrompt({ data: { promptId: id } }),
  })

export const Route = createFileRoute('/prompts/$promptId')({
  loader: ({ context, params }) => context.queryClient.ensureQueryData(promptQuery(Number(params.promptId))),
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

  return <PromptDetailLoaded data={data} />
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
  const { prompt, versions } = data
  const queryClient = useQueryClient()
  const user = useUser()
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

  const baselineKey = useMemo(
    () =>
      JSON.stringify({
        m: activeVersion?.messages ?? [],
        p: activeVersion?.modelParams ?? {},
        t: activeVersion?.tools ?? [],
        r: activeVersion?.responseFormat ?? { type: 'text' },
      }),
    [activeVersion],
  )
  const currentKey = useMemo(
    () => JSON.stringify({ m: messages, p: modelParams, t: tools, r: responseFormat }),
    [messages, modelParams, tools, responseFormat],
  )
  const hasChanges = baselineKey !== currentKey

  const [discardOpen, setDiscardOpen] = useState(false)
  const [pendingVersionId, setPendingVersionId] = useState<number | null>(null)
  const [endpointUrl, setEndpointUrl] = useState<string>(DEFAULT_ENDPOINT)
  const [latestResult, setLatestResult] = useState<LiveRunOutput | null>(null)
  const [runError, setRunError] = useState<string | null>(null)

  useEffect(() => {
    setEndpointUrl(readStoredEndpoint())
  }, [])

  const handleEndpointChange = (next: string) => {
    setEndpointUrl(next)
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(ENDPOINT_STORAGE_KEY, next)
    }
  }

  const runMutation = useMutation({
    mutationFn: () =>
      runLive({
        endpointUrl,
        messages,
        modelParams,
      }),
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

  return (
    <Page title={<PromptBreadcrumb name={prompt.name} />}>
      <div className="flex flex-col gap-4">
        <PromptDetailHeader
          prompt={prompt}
          latestVersion={latest}
          hasChanges={hasChanges}
          saving={saveMutation.isPending}
          isLatest={isLatest}
          activeVersion={activeVersion?.version ?? 0}
          onSave={() => saveMutation.mutate()}
        />

        <div className="px-4 lg:px-6">
          <Tabs defaultValue="editor">
            <TabsList>
              <TabsTrigger value="editor">Editor</TabsTrigger>
              <TabsTrigger value="linked">Linked traces</TabsTrigger>
              <TabsTrigger value="settings">Settings</TabsTrigger>
            </TabsList>

            <TabsContent value="editor" className="pt-4">
              <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_340px]">
                <div className="flex flex-col gap-4">
                  <PromptEditor messages={messages} onChange={setMessages} />
                  <Separator />
                  <div className="flex flex-col gap-2">
                    <div className="flex items-center gap-2">
                      <Label htmlFor="endpoint-url" className="text-xs whitespace-nowrap text-muted-foreground">
                        Agent endpoint
                      </Label>
                      <Input
                        id="endpoint-url"
                        value={endpointUrl}
                        onChange={(e) => handleEndpointChange(e.target.value)}
                        placeholder={DEFAULT_ENDPOINT}
                        className="h-8 max-w-sm font-mono text-xs"
                      />
                      <Button
                        onClick={() => runMutation.mutate()}
                        disabled={!endpointUrl.trim() || runMutation.isPending || messages.length === 0}
                      >
                        <HugeiconsIcon icon={PlayCircleIcon} strokeWidth={2} data-icon="inline-start" />
                        {runMutation.isPending ? 'Running…' : 'Run'}
                      </Button>
                    </div>
                  </div>
                  <Separator />
                  <RunResultPanel result={latestResult} isRunning={runMutation.isPending} error={runError} />
                </div>
                <aside className="flex flex-col gap-6">
                  <VersionRail
                    versions={versions}
                    activeVersionId={activeVersion?.id ?? 0}
                    onSelect={handleSelectVersion}
                  />
                  <ModelParamsPanel value={modelParams} onChange={setModelParams} />
                  <ToolsPanel tools={tools} onChange={setTools} />
                  <ResponseFormatPanel value={responseFormat} onChange={setResponseFormat} />
                </aside>
              </div>
            </TabsContent>

            <TabsContent value="linked" className="pt-4">
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

            <TabsContent value="settings" className="pt-4">
              <SettingsTab prompt={prompt} />
            </TabsContent>
          </Tabs>
        </div>
      </div>

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
    <div className="flex max-w-xl flex-col gap-4">
      <Card>
        <CardHeader>
          <CardTitle>General</CardTitle>
          <CardDescription>Prompt metadata. Edits don't change the version history.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
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
            <Button onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending}>
              {saveMutation.isPending ? 'Saving…' : 'Save'}
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-destructive">Danger zone</CardTitle>
          <CardDescription>Deleting a prompt removes all its versions. This can't be undone.</CardDescription>
        </CardHeader>
        <CardContent>
          <Button variant="destructive" onClick={() => setDeleteOpen(true)}>
            Delete prompt
          </Button>
        </CardContent>
      </Card>

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
