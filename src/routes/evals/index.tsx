import { Add01Icon, TestTubeIcon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { queryOptions, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { createFileRoute, Link } from '@tanstack/react-router'
import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { Page } from '#/components/page'
import { RelativeTime } from '#/components/relative-time'
import { Badge } from '#/components/ui/badge'
import { Button } from '#/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '#/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '#/components/ui/dialog'
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '#/components/ui/empty'
import { Input } from '#/components/ui/input'
import { Label } from '#/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '#/components/ui/select'
import { Skeleton } from '#/components/ui/skeleton'
import { Switch } from '#/components/ui/switch'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '#/components/ui/table'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '#/components/ui/tabs'
import { Textarea } from '#/components/ui/textarea'
import { ToggleGroup, ToggleGroupItem } from '#/components/ui/toggle-group'
import {
  type EvalDefinition,
  type EvalMode,
  type EvalScope,
  type EvalStatus,
  SCORE_DATA_TYPES,
  SCORE_TONE_CLASS,
  type ScoreDataType,
  type ScoreTone,
} from '#/lib/eval/evaluation'
import { JUDGE_TEMPLATES } from '#/lib/eval/judge-templates'
import { formatCost } from '#/lib/format'
import { queryKeys, STALE_LIVE_MS, STALE_TELEMETRY_MS } from '#/lib/query-keys'
import { cn } from '#/lib/utils'
import { getJudgeDefaults, listEvalDefinitions, setEvalDefinitionStatus, upsertEvalDefinition } from '#/server/evals'
import type { JudgeDefaults } from '#/server/judge'
import { getOnlineEvalStats, getScoreRollup, type OnlineEvalStat, type ScoreRollupRow } from '#/server/scores'

const definitionsQuery = queryOptions({
  queryKey: queryKeys.evals.definitions(),
  queryFn: () => listEvalDefinitions({ data: {} }),
  staleTime: STALE_TELEMETRY_MS,
})

const rollupQuery = queryOptions({
  queryKey: queryKeys.scores.rollup('7d'),
  queryFn: () => {
    const nowMs = Date.now()
    return getScoreRollup({ data: { sinceMs: nowMs - 7 * 24 * 60 * 60 * 1000 } })
  },
  staleTime: STALE_TELEMETRY_MS,
})

const judgeDefaultsQuery = queryOptions({
  queryKey: queryKeys.evals.judgeDefaults(),
  queryFn: () => getJudgeDefaults(),
  staleTime: STALE_TELEMETRY_MS,
})

const onlineStatsQuery = queryOptions({
  queryKey: queryKeys.evals.onlineStats(),
  queryFn: () => getOnlineEvalStats(),
  staleTime: STALE_LIVE_MS,
})

export const Route = createFileRoute('/evals/')({
  loader: ({ context }) =>
    Promise.all([
      context.queryClient.ensureQueryData(definitionsQuery),
      context.queryClient.ensureQueryData(rollupQuery),
    ]),
  component: EvalsPage,
})

const SCOPE_OPTIONS: { label: string; value: EvalScope }[] = [
  { label: 'Span', value: 'span' },
  { label: 'Trace', value: 'trace' },
  { label: 'Session', value: 'session' },
]

const DATA_TYPE_LABEL: Record<ScoreDataType, string> = {
  numeric: 'Numeric',
  categorical: 'Categorical',
  boolean: 'Boolean',
  text: 'Text',
}

function passRateTone(rate: number): ScoreTone {
  if (rate >= 0.8) return 'good'
  if (rate >= 0.5) return 'warn'
  return 'bad'
}

function EvalsPage() {
  const { data: definitions = [], isLoading } = useQuery(definitionsQuery)
  const { data: rollup = [] } = useQuery(rollupQuery)
  const { data: judgeDefaults } = useQuery(judgeDefaultsQuery)
  const { data: onlineStats = {} } = useQuery(onlineStatsQuery)

  const [setupOpen, setSetupOpen] = useState(false)

  const running = definitions.filter((d) => d.mode === 'online')
  const offline = definitions.filter((d) => d.mode === 'offline')

  return (
    <Page
      title="Evals"
      actions={
        <SetupEvaluatorDialog
          open={setupOpen}
          onOpenChange={setSetupOpen}
          defaultModel={judgeDefaults?.model ?? ''}
          trigger={
            <Button size="sm">
              <HugeiconsIcon icon={Add01Icon} strokeWidth={2} data-icon="inline-start" />
              Set up evaluator
            </Button>
          }
        />
      }
    >
      <div className="flex flex-col gap-6 px-4 lg:px-6">
        {judgeDefaults && <JudgeStatus judge={judgeDefaults} />}

        {isLoading ? (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {Array.from({ length: 4 }).map((_, i) => (
              // biome-ignore lint/suspicious/noArrayIndexKey: skeleton placeholders
              <Skeleton key={i} className="h-24 w-full rounded-xl" />
            ))}
          </div>
        ) : (
          rollup.length > 0 && <RollupSection rows={rollup} />
        )}

        {isLoading ? (
          <div className="flex flex-col gap-2">
            {Array.from({ length: 5 }).map((_, i) => (
              // biome-ignore lint/suspicious/noArrayIndexKey: skeleton placeholders
              <Skeleton key={i} className="h-10 w-full" />
            ))}
          </div>
        ) : (
          <Tabs defaultValue="running" className="flex flex-col gap-4">
            <TabsList variant="line" className="h-auto gap-x-4 border-b">
              <TabsTrigger value="running" className="flex-none px-1 pb-2">
                Running Evaluators
                {running.length > 0 && <span className="font-mono text-muted-foreground">{running.length}</span>}
              </TabsTrigger>
              <TabsTrigger value="offline" className="flex-none px-1 pb-2">
                Evaluator Library
                {offline.length > 0 && <span className="font-mono text-muted-foreground">{offline.length}</span>}
              </TabsTrigger>
            </TabsList>

            <TabsContent value="running">
              {running.length === 0 ? (
                <EvaluatorsEmpty onSetup={() => setSetupOpen(true)} />
              ) : (
                <RunningTable definitions={running} stats={onlineStats} />
              )}
            </TabsContent>

            <TabsContent value="offline">
              {offline.length === 0 ? (
                <EvaluatorsEmpty onSetup={() => setSetupOpen(true)} />
              ) : (
                <LibraryTable definitions={offline} />
              )}
            </TabsContent>
          </Tabs>
        )}
      </div>
    </Page>
  )
}

function RollupSection({ rows }: { rows: ScoreRollupRow[] }) {
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
      {rows.map((row) => {
        const pct = Math.round(row.passRate * 100)
        return (
          <Card key={row.name} size="sm">
            <CardHeader>
              <CardTitle className="truncate text-sm" title={row.name}>
                {row.name}
              </CardTitle>
            </CardHeader>
            <CardContent className="flex items-baseline justify-between gap-2">
              <div className="flex flex-col gap-0.5">
                <span
                  className={cn('text-2xl font-semibold tabular-nums', SCORE_TONE_CLASS[passRateTone(row.passRate)])}
                >
                  {pct}%
                </span>
                <span className="text-xs text-muted-foreground">{row.total} scored</span>
              </div>
              {row.avg != null && (
                <span className="text-xs text-muted-foreground tabular-nums">avg {row.avg.toFixed(2)}</span>
              )}
            </CardContent>
          </Card>
        )
      })}
    </div>
  )
}

function RunningTable({
  definitions,
  stats,
}: {
  definitions: EvalDefinition[]
  stats: Record<number, OnlineEvalStat>
}) {
  return (
    <div className="overflow-hidden rounded-lg border">
      <Table>
        <TableHeader className="bg-muted/40 [&_th]:font-normal [&_th]:text-muted-foreground">
          <TableRow>
            <TableHead>Score name</TableHead>
            <TableHead>Status</TableHead>
            <TableHead className="text-right">Result</TableHead>
            <TableHead className="text-right">Cost</TableHead>
            <TableHead>Model</TableHead>
            <TableHead>Version</TableHead>
            <TableHead>Updated</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {definitions.map((def) => {
            const stat = stats[def.id]
            return (
              <TableRow key={def.id}>
                <TableCell>
                  <Link to="/evals/$evalId" params={{ evalId: String(def.id) }} className="font-medium hover:underline">
                    {def.name}
                  </Link>
                </TableCell>
                <TableCell>
                  <StatusToggle id={def.id} status={def.status} />
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {stat && stat.passRate != null ? (
                    <span className={SCORE_TONE_CLASS[passRateTone(stat.passRate)]}>
                      {Math.round(stat.passRate * 100)}%
                      <span className="ml-1 text-xs text-muted-foreground">({stat.scored})</span>
                    </span>
                  ) : stat?.scored ? (
                    <span className="text-muted-foreground">{stat.scored} scored</span>
                  ) : (
                    <span className="text-muted-foreground">—</span>
                  )}
                </TableCell>
                <TableCell className="text-right tabular-nums text-muted-foreground">
                  {stat?.costUsd ? formatCost(stat.costUsd) : '—'}
                </TableCell>
                <TableCell className="font-mono text-xs">{def.model}</TableCell>
                <TableCell className="tabular-nums text-muted-foreground">v{def.version}</TableCell>
                <TableCell className="text-muted-foreground">
                  <RelativeTime ts={def.updatedAt} />
                </TableCell>
              </TableRow>
            )
          })}
        </TableBody>
      </Table>
    </div>
  )
}

function JudgeStatus({ judge }: { judge: JudgeDefaults }) {
  if (!judge.configured) {
    return (
      <p className="text-xs text-muted-foreground">
        No judge model configured. Set <span className="font-mono text-foreground">OPENAI_API_KEY</span> or{' '}
        <span className="font-mono text-foreground">ANTHROPIC_API_KEY</span> (or a local{' '}
        <span className="font-mono text-foreground">JUDGE_BASE_URL</span>) to run judges.
      </p>
    )
  }
  const keys = [
    judge.hasOpenAIKey && 'OpenAI',
    judge.hasAnthropicKey && 'Anthropic',
    judge.baseUrl && 'custom endpoint',
  ].filter(Boolean) as string[]
  return (
    <p className="text-xs text-muted-foreground">
      Judge: <span className="font-mono text-foreground">{judge.model}</span>
      {keys.length > 0 && <> · {keys.join(', ')} ready</>}
    </p>
  )
}

function LibraryTable({ definitions }: { definitions: EvalDefinition[] }) {
  return (
    <div className="overflow-hidden rounded-lg border">
      <Table>
        <TableHeader className="bg-muted/40 [&_th]:font-normal [&_th]:text-muted-foreground">
          <TableRow>
            <TableHead>Name</TableHead>
            <TableHead>Scope</TableHead>
            <TableHead>Data type</TableHead>
            <TableHead>Model</TableHead>
            <TableHead>Version</TableHead>
            <TableHead>Updated</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {definitions.map((def) => (
            <TableRow key={def.id}>
              <TableCell>
                <Link to="/evals/$evalId" params={{ evalId: String(def.id) }} className="font-medium hover:underline">
                  {def.name}
                </Link>
              </TableCell>
              <TableCell className="capitalize text-muted-foreground">{def.scope}</TableCell>
              <TableCell className="text-muted-foreground">{DATA_TYPE_LABEL[def.dataType]}</TableCell>
              <TableCell className="font-mono text-xs">{def.model}</TableCell>
              <TableCell className="tabular-nums text-muted-foreground">v{def.version}</TableCell>
              <TableCell className="text-muted-foreground">
                <RelativeTime ts={def.updatedAt} />
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  )
}

function StatusToggle({ id, status }: { id: number; status: EvalStatus }) {
  const queryClient = useQueryClient()
  const active = status === 'active'

  const mutation = useMutation({
    mutationFn: (next: EvalStatus) => setEvalDefinitionStatus({ data: { id, status: next } }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.evals.definitions() })
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : String(err)),
  })

  return (
    <div className="flex items-center gap-2">
      <Switch
        size="sm"
        checked={active}
        disabled={mutation.isPending}
        onCheckedChange={(checked) => mutation.mutate(checked ? 'active' : 'paused')}
        aria-label="Toggle evaluator status"
      />
      <Badge variant={active ? 'success' : 'outline'} className={cn(!active && 'text-muted-foreground')}>
        {active ? 'Active' : 'Paused'}
      </Badge>
    </div>
  )
}

function EvaluatorsEmpty({ onSetup }: { onSetup: () => void }) {
  return (
    <Empty>
      <EmptyHeader>
        <EmptyMedia variant="icon">
          <HugeiconsIcon icon={TestTubeIcon} />
        </EmptyMedia>
        <EmptyTitle>No evaluators yet</EmptyTitle>
        <EmptyDescription>Set up an LLM-judge or code evaluator to start scoring your traces.</EmptyDescription>
      </EmptyHeader>
      <Button size="sm" onClick={onSetup}>
        <HugeiconsIcon icon={Add01Icon} strokeWidth={2} data-icon="inline-start" />
        Set up evaluator
      </Button>
    </Empty>
  )
}

function SetupEvaluatorDialog({
  open,
  onOpenChange,
  defaultModel,
  trigger,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  defaultModel: string
  trigger: React.ReactNode
}) {
  const queryClient = useQueryClient()
  const [name, setName] = useState('')
  const [scope, setScope] = useState<EvalScope>('trace')
  const [dataType, setDataType] = useState<ScoreDataType>('boolean')
  const [mode, setMode] = useState<EvalMode>('offline')
  const [judgePrompt, setJudgePrompt] = useState('')
  const [model, setModel] = useState(defaultModel)

  // Seed the model field with the resolved judge default once it loads.
  useEffect(() => {
    if (open) setModel((prev) => prev || defaultModel)
  }, [open, defaultModel])

  const reset = () => {
    setName('')
    setScope('trace')
    setDataType('boolean')
    setMode('offline')
    setJudgePrompt('')
    setModel(defaultModel)
  }

  const applyTemplate = (key: string) => {
    const t = JUDGE_TEMPLATES.find((x) => x.key === key)
    if (!t) return
    setName(t.key)
    setScope(t.scope)
    setDataType(t.dataType)
    setJudgePrompt(t.judgePrompt)
  }

  const mutation = useMutation({
    mutationFn: () =>
      upsertEvalDefinition({
        data: {
          name: name.trim(),
          scope,
          dataType,
          source: 'llm',
          mode,
          judgePrompt: judgePrompt.trim() || null,
          model: model.trim() || undefined,
        },
      }),
    onSuccess: async (def) => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.evals.definitions() })
      toast.success(`Evaluator "${def.name}" created`)
      reset()
      onOpenChange(false)
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : String(err)),
  })

  const canSubmit = name.trim().length > 0 && !mutation.isPending

  return (
    <Dialog
      open={open}
      onOpenChange={(value) => {
        onOpenChange(value)
        if (!value) reset()
      }}
    >
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Set up evaluator</DialogTitle>
          <DialogDescription>
            Define an LLM-judge that scores spans, traces, or sessions on a dimension.
          </DialogDescription>
        </DialogHeader>
        <form
          className="flex flex-col gap-4"
          onSubmit={(e) => {
            e.preventDefault()
            if (canSubmit) mutation.mutate()
          }}
        >
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="evaluator-template">Start from a template</Label>
            <Select onValueChange={applyTemplate}>
              <SelectTrigger id="evaluator-template">
                <SelectValue placeholder="Optional — prefill from a known judge" />
              </SelectTrigger>
              <SelectContent>
                {JUDGE_TEMPLATES.map((t) => (
                  <SelectItem key={t.key} value={t.key}>
                    {t.label} — {t.description}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="evaluator-name">Name</Label>
            <Input
              id="evaluator-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. helpfulness"
              autoFocus
            />
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <Label>Scope</Label>
              <ToggleGroup
                type="single"
                variant="outline"
                size="sm"
                spacing={0}
                value={scope}
                onValueChange={(v) => v && setScope(v as EvalScope)}
              >
                {SCOPE_OPTIONS.map((o) => (
                  <ToggleGroupItem key={o.value} value={o.value}>
                    {o.label}
                  </ToggleGroupItem>
                ))}
              </ToggleGroup>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="evaluator-data-type">Data type</Label>
              <Select value={dataType} onValueChange={(v) => setDataType(v as ScoreDataType)}>
                <SelectTrigger id="evaluator-data-type">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {SCORE_DATA_TYPES.map((dt) => (
                    <SelectItem key={dt} value={dt}>
                      {DATA_TYPE_LABEL[dt]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="evaluator-mode">Mode</Label>
              <Select value={mode} onValueChange={(v) => setMode(v as EvalMode)}>
                <SelectTrigger id="evaluator-mode">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="offline">Library</SelectItem>
                  <SelectItem value="online">Online</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="evaluator-model">Model</Label>
              <Input
                id="evaluator-model"
                value={model}
                onChange={(e) => setModel(e.target.value)}
                placeholder={defaultModel || 'gpt-4o-mini'}
                className="font-mono text-xs"
              />
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="evaluator-judge-prompt">Judge prompt</Label>
            <Textarea
              id="evaluator-judge-prompt"
              value={judgePrompt}
              onChange={(e) => setJudgePrompt(e.target.value)}
              placeholder="Instructions for the judge. Reference the target's fields and the expected output."
              rows={5}
            />
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={!canSubmit}>
              {mutation.isPending ? 'Creating…' : 'Create evaluator'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
