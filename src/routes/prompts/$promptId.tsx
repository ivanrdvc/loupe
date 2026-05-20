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
import { queryKeys } from '#/lib/query-keys'
import { ModelParamsPanel } from './-components/model-params-panel'
import { PromptDetailHeader } from './-components/prompt-detail-header'
import { PromptEditor } from './-components/prompt-editor'
import { ResponseFormatPanel } from './-components/response-format-panel'
import { RunDiffSheet } from './-components/run-diff-sheet'
import { RunOutputPanel } from './-components/run-output-panel'
import { ToolsPanel } from './-components/tools-panel'
import { VariablesPanel } from './-components/variables-panel'
import { VersionRail } from './-components/version-rail'
import { deletePrompt, getPrompt, listRuns, runPrompt, saveNewVersion, updatePrompt } from './-mock-data'
import type { Message, ModelParams, PromptRun, ResponseFormat, Tool } from './-types'

const promptQuery = (id: string) =>
  queryOptions({
    queryKey: queryKeys.prompts.byId(id),
    queryFn: () => getPrompt(id),
  })

export const Route = createFileRoute('/prompts/$promptId')({
  loader: ({ context, params }) => context.queryClient.ensureQueryData(promptQuery(params.promptId)),
  component: PromptDetailPage,
})

function PromptDetailPage() {
  const { promptId } = Route.useParams()
  const { data: prompt, isLoading } = useQuery(promptQuery(promptId))

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

  if (!prompt) {
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

  return <PromptDetailLoaded prompt={prompt} />
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

function PromptDetailLoaded({ prompt }: { prompt: NonNullable<Awaited<ReturnType<typeof getPrompt>>> }) {
  const queryClient = useQueryClient()
  const latest = prompt.versions[prompt.versions.length - 1]
  const [activeVersionId, setActiveVersionId] = useState(latest.id)
  const activeVersion = useMemo(
    () => prompt.versions.find((v) => v.id === activeVersionId) ?? latest,
    [prompt.versions, activeVersionId, latest],
  )
  const isLatest = activeVersion.id === latest.id

  const [messages, setMessages] = useState<Message[]>(activeVersion.messages)
  const [modelParams, setModelParams] = useState<ModelParams>(activeVersion.modelParams)
  const [tools, setTools] = useState<Tool[]>(activeVersion.tools)
  const [responseFormat, setResponseFormat] = useState<ResponseFormat>(activeVersion.responseFormat)
  const [varValues, setVarValues] = useState<Record<string, string>>({})

  useEffect(() => {
    setMessages(activeVersion.messages)
    setModelParams(activeVersion.modelParams)
    setTools(activeVersion.tools)
    setResponseFormat(activeVersion.responseFormat)
    setVarValues({})
  }, [activeVersion])

  const baselineKey = useMemo(
    () =>
      JSON.stringify({
        m: activeVersion.messages,
        p: activeVersion.modelParams,
        t: activeVersion.tools,
        r: activeVersion.responseFormat,
      }),
    [activeVersion],
  )
  const currentKey = useMemo(
    () => JSON.stringify({ m: messages, p: modelParams, t: tools, r: responseFormat }),
    [messages, modelParams, tools, responseFormat],
  )
  const hasChanges = baselineKey !== currentKey

  const [discardOpen, setDiscardOpen] = useState(false)
  const [pendingVersionId, setPendingVersionId] = useState<string | null>(null)

  const saveMutation = useMutation({
    mutationFn: () =>
      saveNewVersion(prompt.id, {
        messages,
        modelParams,
        tools,
        responseFormat,
      }),
    onSuccess: async (newVersion) => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.prompts.all() })
      setActiveVersionId(newVersion.id)
      toast.success(`Saved as v${newVersion.version}`)
    },
  })

  const { data: runs = [] } = useQuery({
    queryKey: queryKeys.prompts.runs(prompt.id),
    queryFn: () => listRuns(prompt.id),
  })

  const runMutation = useMutation({
    mutationFn: () =>
      runPrompt({
        promptId: prompt.id,
        versionId: activeVersion.id,
        varValues,
        currentMessages: messages,
        modelParams,
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.prompts.runs(prompt.id) })
    },
  })

  const latestRun = runs[0] ?? null

  const [diffOpen, setDiffOpen] = useState(false)
  const [diffRunA, setDiffRunA] = useState<PromptRun | null>(null)
  const [diffRunB, setDiffRunB] = useState<PromptRun | null>(null)

  const handleShowDiff = (run: PromptRun) => {
    setDiffRunA(run)
    setDiffRunB(runs[0] ?? null)
    setDiffOpen(true)
  }

  const handleRun = () => {
    if (hasChanges) toast('Running with unsaved changes.')
    runMutation.mutate()
  }

  const handleSelectVersion = (id: string) => {
    if (id === activeVersionId) return
    if (hasChanges) {
      setPendingVersionId(id)
      setDiscardOpen(true)
      return
    }
    setActiveVersionId(id)
  }

  const confirmDiscard = () => {
    if (pendingVersionId) setActiveVersionId(pendingVersionId)
    setPendingVersionId(null)
    setDiscardOpen(false)
  }

  return (
    <Page title={<PromptBreadcrumb name={prompt.name} />}>
      <div className="flex flex-col gap-4">
        <PromptDetailHeader
          prompt={prompt}
          hasChanges={hasChanges}
          saving={saveMutation.isPending}
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
              {!isLatest && (
                <div className="mb-3 rounded-lg border border-dashed bg-muted/50 px-3 py-2 text-xs text-muted-foreground">
                  Viewing v{activeVersion.version}. Editing creates a new version on top of the latest (v
                  {latest.version}).
                </div>
              )}
              <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_340px]">
                <div className="flex flex-col gap-4">
                  <PromptEditor messages={messages} onChange={setMessages} />
                  <Separator />
                  <div>
                    <Button onClick={handleRun} disabled={runMutation.isPending}>
                      <HugeiconsIcon icon={PlayCircleIcon} strokeWidth={2} data-icon="inline-start" />
                      {runMutation.isPending ? 'Running…' : 'Run'}
                    </Button>
                  </div>
                  <Separator />
                  <RunOutputPanel
                    promptId={prompt.id}
                    runs={runs}
                    isRunning={runMutation.isPending}
                    latestRun={latestRun}
                    onShowDiff={handleShowDiff}
                  />
                </div>
                <aside className="flex flex-col gap-4">
                  <VersionRail
                    versions={prompt.versions}
                    activeVersionId={activeVersion.id}
                    onSelect={handleSelectVersion}
                  />
                  <Separator />
                  <VariablesPanel messages={messages} values={varValues} onChange={setVarValues} />
                  <Separator />
                  <ModelParamsPanel value={modelParams} onChange={setModelParams} />
                  <Separator />
                  <ToolsPanel tools={tools} onChange={setTools} />
                  <Separator />
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

      <RunDiffSheet open={diffOpen} onOpenChange={setDiffOpen} runA={diffRunA} runB={diffRunB} />
    </Page>
  )
}

function SettingsTab({ prompt }: { prompt: NonNullable<Awaited<ReturnType<typeof getPrompt>>> }) {
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const [name, setName] = useState(prompt.name)
  const [description, setDescription] = useState(prompt.description)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [confirmText, setConfirmText] = useState('')

  const saveMutation = useMutation({
    mutationFn: () => updatePrompt(prompt.id, { name: name.trim(), description: description.trim() }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.prompts.all() })
      toast.success('Settings saved')
    },
  })

  const deleteMutation = useMutation({
    mutationFn: () => deletePrompt(prompt.id),
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
