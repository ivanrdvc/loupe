import { Add01Icon, TestTubeIcon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { queryOptions, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { createFileRoute, Link } from '@tanstack/react-router'
import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { Page } from '#/components/page'
import { RelativeTime } from '#/components/relative-time'
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
import { ProgressCircle } from '#/components/ui/progress-circle'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '#/components/ui/select'
import { Skeleton } from '#/components/ui/skeleton'
import { Switch } from '#/components/ui/switch'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '#/components/ui/table'
import { Textarea } from '#/components/ui/textarea'
import { ToggleGroup, ToggleGroupItem } from '#/components/ui/toggle-group'
import { ModelSelect } from '#/features/evaluation/components/model-select'
import {
  getJudgeDefaults,
  listEvalDefinitions,
  setEvalDefinitionLive,
  upsertEvalDefinition,
} from '#/features/evaluation/server/evals'
import type { JudgeDefaults } from '#/features/evaluation/server/judge'
import {
  getOnlineEvalStats,
  getScoreRollup,
  listScoreConfigs,
  type OnlineEvalStat,
  type ScoreRollupRow,
} from '#/features/evaluation/server/scores'
import {
  type EvalDefinition,
  type EvalScope,
  SCORE_DATA_TYPES,
  SCORE_SOURCE_ICON,
  SCORE_SOURCE_LABEL,
  SCORE_TONE_CLASS,
  type ScoreDataType,
  type ScoreSource,
  type ScoreTone,
} from '#/lib/eval/evaluation'
import { JUDGE_TEMPLATES } from '#/lib/eval/judge-templates'
import { errMessage, formatCost } from '#/lib/format'
import { queryKeys, STALE_LIVE_MS, STALE_TELEMETRY_MS } from '#/lib/query-keys'
import { cn } from '#/lib/utils'

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

const configsQuery = queryOptions({
  queryKey: queryKeys.scores.configs(),
  queryFn: () => listScoreConfigs(),
  staleTime: STALE_TELEMETRY_MS,
})

const SOURCE_ORDER: ScoreSource[] = ['human', 'llm', 'code']

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

function isLive(def: EvalDefinition): boolean {
  return def.mode === 'online'
}

function EvalsPage() {
  const { data: definitions = [], isLoading } = useQuery(definitionsQuery)
  const { data: rollup = [] } = useQuery(rollupQuery)
  const { data: judgeDefaults } = useQuery(judgeDefaultsQuery)
  const { data: onlineStats = {} } = useQuery(onlineStatsQuery)
  const { data: configs = [] } = useQuery(configsQuery)

  const [setupOpen, setSetupOpen] = useState(false)

  // Cards only for defined dimensions or evaluator-owned names — never stray ingested names.
  const known = new Set([...definitions.map((d) => d.name), ...configs.map((c) => c.name)])
  const cards = rollup.filter((r) => known.has(r.name))

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
        <div className="flex flex-col gap-1">
          {judgeDefaults && <JudgeStatus judge={judgeDefaults} />}
          <p className="text-xs text-muted-foreground">
            <span className="text-foreground">Live</span> evaluators score new traces automatically. The rest stay idle
            until you run them from their page.
          </p>
        </div>

        {isLoading ? (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {Array.from({ length: 4 }).map((_, i) => (
              // biome-ignore lint/suspicious/noArrayIndexKey: skeleton placeholders
              <Skeleton key={i} className="h-24 w-full rounded-xl" />
            ))}
          </div>
        ) : cards.length > 0 ? (
          <section className="flex flex-col gap-3">
            <h2 className="text-sm font-medium">Dimensions</h2>
            <RollupSection rows={cards} />
          </section>
        ) : null}

        {isLoading ? (
          <div className="flex flex-col gap-2">
            {Array.from({ length: 5 }).map((_, i) => (
              // biome-ignore lint/suspicious/noArrayIndexKey: skeleton placeholders
              <Skeleton key={i} className="h-10 w-full" />
            ))}
          </div>
        ) : definitions.length === 0 ? (
          <EvaluatorsEmpty onSetup={() => setSetupOpen(true)} />
        ) : (
          <EvaluatorsTable definitions={definitions} stats={onlineStats} />
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
                <span className="flex gap-2 text-xs text-muted-foreground">
                  {SOURCE_ORDER.filter((s) => row.bySource[s] > 0).map((s) => (
                    <span key={s} title={SCORE_SOURCE_LABEL[s]}>
                      <span aria-hidden>{SCORE_SOURCE_ICON[s]}</span> {row.bySource[s]}
                    </span>
                  ))}
                </span>
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

function EvaluatorsTable({
  definitions,
  stats,
}: {
  definitions: EvalDefinition[]
  stats: Record<number, OnlineEvalStat>
}) {
  return (
    <div className="-mx-4 border-y bg-background lg:-mx-6">
      <Table>
        <TableHeader className="bg-muted/40 [&_th]:font-normal [&_th]:text-muted-foreground">
          <TableRow className="[&>:first-child]:pl-4 [&>:last-child]:pr-4 lg:[&>:first-child]:pl-6 lg:[&>:last-child]:pr-6">
            <TableHead>Evaluator</TableHead>
            <TableHead>Live</TableHead>
            <TableHead>Result</TableHead>
            <TableHead className="text-right">Cost</TableHead>
            <TableHead>Model</TableHead>
            <TableHead>Updated</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {[...definitions]
            .sort((a, b) => a.name.localeCompare(b.name))
            .map((def) => {
              const stat = stats[def.id]
              return (
                <TableRow
                  key={def.id}
                  className="[&>:first-child]:pl-4 [&>:last-child]:pr-4 lg:[&>:first-child]:pl-6 lg:[&>:last-child]:pr-6"
                >
                  <TableCell className="py-2.5">
                    <div className="flex flex-col gap-0.5">
                      <Link
                        to="/evals/$evalId"
                        params={{ evalId: String(def.id) }}
                        className="font-medium text-foreground hover:underline"
                      >
                        {def.name}
                      </Link>
                      <span className="text-xs capitalize text-muted-foreground">
                        {def.scope} · {DATA_TYPE_LABEL[def.dataType]}
                      </span>
                    </div>
                  </TableCell>
                  <TableCell>
                    <LiveToggle id={def.id} live={isLive(def)} />
                  </TableCell>
                  <TableCell>
                    <ResultCell stat={stat} />
                  </TableCell>
                  <TableCell className="text-right tabular-nums text-muted-foreground">
                    {stat?.costUsd ? formatCost(stat.costUsd) : '—'}
                  </TableCell>
                  <TableCell>
                    <span className="font-mono text-xs text-foreground">{def.model || '—'}</span>
                  </TableCell>
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

function ResultCell({ stat }: { stat: OnlineEvalStat | undefined }) {
  if (!stat || stat.passRate == null) {
    return <span className="text-sm text-muted-foreground">{stat?.scored ? `${stat.scored} scored` : '—'}</span>
  }
  const tone = passRateTone(stat.passRate)
  const pct = Math.round(stat.passRate * 100)
  return (
    <div className="flex items-center gap-2.5">
      <ProgressCircle value={pct} className={SCORE_TONE_CLASS[tone]}>
        <span className={cn('text-[10px] font-semibold tabular-nums', SCORE_TONE_CLASS[tone])}>{pct}</span>
      </ProgressCircle>
      <div className="flex flex-col gap-0">
        <span className="text-sm text-foreground">
          <span className="font-medium tabular-nums">{stat.pass}</span> pass
        </span>
        <span className="text-xs tabular-nums text-muted-foreground">of {stat.scored} scored</span>
      </div>
    </div>
  )
}

function JudgeStatus({ judge }: { judge: JudgeDefaults }) {
  if (!judge.configured) {
    return (
      <p className="text-xs text-muted-foreground">
        No judge model configured. Set <span className="font-mono text-foreground">OPENAI_API_KEY</span>,{' '}
        <span className="font-mono text-foreground">ANTHROPIC_API_KEY</span>, or{' '}
        <span className="font-mono text-foreground">AZURE_OPENAI_API_KEY</span> to run judges.
      </p>
    )
  }
  const keys = [
    judge.hasOpenAIKey && 'OpenAI',
    judge.hasAnthropicKey && 'Anthropic',
    judge.hasAzureKey && 'Azure OpenAI',
  ].filter(Boolean) as string[]
  return (
    <p className="text-xs text-muted-foreground">
      Judge: <span className="font-mono text-foreground">{judge.model}</span>
      {keys.length > 0 && <> · {keys.join(', ')} ready</>}
    </p>
  )
}

function LiveToggle({ id, live }: { id: number; live: boolean }) {
  const queryClient = useQueryClient()

  const mutation = useMutation({
    mutationFn: (next: boolean) => setEvalDefinitionLive({ data: { id, live: next } }),
    onSuccess: async (_data, next) => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.evals.definitions() })
      toast.success(next ? 'Now scoring live traffic' : 'Moved to library')
    },
    onError: (err) => toast.error(errMessage(err)),
  })

  return (
    <Switch
      size="sm"
      checked={live}
      disabled={mutation.isPending}
      onCheckedChange={(checked) => mutation.mutate(checked)}
      aria-label="Toggle live scoring"
    />
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
          mode: 'offline',
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
    onError: (err) => toast.error(errMessage(err)),
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
            Define an LLM-judge that scores spans, traces, or sessions on a dimension. Flip it Live from the list to
            score production traffic.
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

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="evaluator-model">Model</Label>
            <ModelSelect id="evaluator-model" value={model} onChange={setModel} />
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
