import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { Button } from '#/components/ui/button'
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '#/components/ui/dialog'
import { Input } from '#/components/ui/input'
import { Label } from '#/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '#/components/ui/select'
import { Textarea } from '#/components/ui/textarea'
import { ToggleGroup, ToggleGroupItem } from '#/components/ui/toggle-group'
import { ModelSelect } from '#/features/evaluation/components/model-select'
import { JUDGE_TEMPLATES } from '#/features/evaluation/logic/judge-templates'
import { upsertEvalDefinition } from '#/features/evaluation/server/evals'
import {
  DATA_TYPE_LABEL,
  type EvalDefinition,
  type EvalMode,
  type EvalScope,
  type EvalSourceKind,
  type LiveFilter,
  SCORE_DATA_TYPES,
  SCORE_TARGET_KINDS,
  type ScoreDataType,
} from '#/lib/eval/evaluation'
import { errMessage } from '#/lib/format'
import { queryKeys } from '#/lib/query-keys'

const SCOPE_OPTIONS: { label: string; value: EvalScope }[] = [
  { label: 'Span', value: 'span' },
  { label: 'Trace', value: 'trace' },
  { label: 'Session', value: 'session' },
]

export type LiveFilterForm = { sampleRate: string; serviceName: string; agentName: string }

export function readLiveFilter(raw: EvalDefinition['liveFilter']): LiveFilterForm {
  const f = (raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {}) as Record<string, unknown>
  return {
    sampleRate: typeof f.sampleRate === 'number' ? String(f.sampleRate) : '',
    serviceName: typeof f.serviceName === 'string' ? f.serviceName : '',
    agentName: typeof f.agentName === 'string' ? f.agentName : '',
  }
}

function buildLiveFilter(form: LiveFilterForm): LiveFilter {
  const f: NonNullable<LiveFilter> = {}
  const rate = Number(form.sampleRate)
  if (form.sampleRate.trim() && Number.isFinite(rate)) f.sampleRate = Math.min(1, Math.max(0, rate))
  if (form.serviceName.trim()) f.serviceName = form.serviceName.trim()
  if (form.agentName.trim()) f.agentName = form.agentName.trim()
  return Object.keys(f).length ? f : null
}

// One form, two contracts: create stays a minimal LLM-judge setup (source/mode/
// liveFilter never surfaced, always submits source='llm' mode='offline'); edit
// exposes the full definition. `definition` present = edit.
export function EvaluatorFormDialog({
  open,
  onOpenChange,
  definition,
  defaultModel = '',
  trigger,
  onSaved,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  definition?: EvalDefinition
  defaultModel?: string
  trigger?: React.ReactNode
  onSaved?: () => void | Promise<void>
}) {
  const editing = definition != null
  const queryClient = useQueryClient()
  const [name, setName] = useState(definition?.name ?? '')
  const [scope, setScope] = useState<EvalScope>(definition?.scope ?? 'trace')
  const [dataType, setDataType] = useState<ScoreDataType>(definition?.dataType ?? 'boolean')
  const [source, setSource] = useState<EvalSourceKind>(definition?.source ?? 'llm')
  const [mode, setMode] = useState<EvalMode>(definition?.mode ?? 'offline')
  const [model, setModel] = useState(definition?.model ?? defaultModel)
  const [judgePrompt, setJudgePrompt] = useState(definition?.judgePrompt ?? '')
  const [filter, setFilter] = useState<LiveFilterForm>(() => readLiveFilter(definition?.liveFilter ?? null))

  // Seed the model field with the resolved judge default once it loads.
  useEffect(() => {
    if (!editing && open) setModel((prev) => prev || defaultModel)
  }, [editing, open, defaultModel])

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
        data: definition
          ? {
              id: definition.id,
              name: name.trim(),
              scope,
              dataType,
              source,
              mode,
              status: definition.status,
              model: model.trim(),
              judgePrompt: source === 'llm' ? judgePrompt.trim() || null : null,
              liveFilter: mode === 'online' ? buildLiveFilter(filter) : null,
            }
          : {
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
      if (editing) {
        toast.success('Evaluator updated')
        await onSaved?.()
      } else {
        await queryClient.invalidateQueries({ queryKey: queryKeys.evals.definitions() })
        toast.success(`Evaluator "${def.name}" created`)
        reset()
        onOpenChange(false)
      }
    },
    onError: (err) => toast.error(errMessage(err)),
  })

  const canSubmit = name.trim().length > 0 && !mutation.isPending

  return (
    <Dialog
      open={open}
      onOpenChange={(value) => {
        onOpenChange(value)
        if (!editing && !value) reset()
      }}
    >
      {trigger != null && <DialogTrigger asChild>{trigger}</DialogTrigger>}
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{editing ? 'Edit evaluator' : 'Set up evaluator'}</DialogTitle>
          <DialogDescription>
            {editing
              ? 'Changes apply to future runs of this evaluator.'
              : 'Define an LLM-judge that scores spans, traces, or sessions on a dimension. Flip it Live from the list to score production traffic.'}
          </DialogDescription>
        </DialogHeader>
        <form
          className="flex flex-col gap-4"
          onSubmit={(e) => {
            e.preventDefault()
            if (canSubmit) mutation.mutate()
          }}
        >
          {!editing && (
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="evaluator-template">Start from a template</Label>
              <Select onValueChange={applyTemplate}>
                <SelectTrigger id="evaluator-template" className="text-xs">
                  <SelectValue placeholder="Prefill from a template…" />
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
          )}

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="evaluator-name">Name</Label>
            <Input
              id="evaluator-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={editing ? undefined : 'e.g. helpfulness'}
              className="text-xs"
              autoFocus
            />
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              {editing ? (
                <>
                  <Label htmlFor="evaluator-scope">Scope</Label>
                  <Select value={scope} onValueChange={(v) => setScope(v as EvalScope)}>
                    <SelectTrigger id="evaluator-scope" className="text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {SCORE_TARGET_KINDS.map((k) => (
                        <SelectItem key={k} value={k} className="capitalize">
                          {k}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </>
              ) : (
                <>
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
                </>
              )}
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="evaluator-data-type">Data type</Label>
              <Select value={dataType} onValueChange={(v) => setDataType(v as ScoreDataType)}>
                <SelectTrigger id="evaluator-data-type" className="text-xs">
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

          {editing ? (
            <>
              <div className="grid grid-cols-2 gap-4">
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="evaluator-source">Source</Label>
                  <Select value={source} onValueChange={(v) => setSource(v as EvalSourceKind)}>
                    <SelectTrigger id="evaluator-source" className="text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="llm">LLM judge</SelectItem>
                      <SelectItem value="code" disabled>
                        Code (not supported yet)
                      </SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="evaluator-model">Model</Label>
                  <ModelSelect id="evaluator-model" value={model} onChange={setModel} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="evaluator-mode">State</Label>
                  <Select value={mode} onValueChange={(v) => setMode(v as EvalMode)}>
                    <SelectTrigger id="evaluator-mode" className="text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="offline">Library (run on demand)</SelectItem>
                      <SelectItem value="online">Live (score production)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              {mode === 'online' && (
                <div className="flex flex-col gap-3 rounded-lg border bg-card/40 p-3">
                  <p className="text-xs text-muted-foreground">
                    Which live traces this watches. Blank fields match everything.
                  </p>
                  <div className="grid grid-cols-3 gap-3">
                    <div className="flex flex-col gap-1.5">
                      <Label htmlFor="evaluator-service">Service</Label>
                      <Input
                        id="evaluator-service"
                        value={filter.serviceName}
                        onChange={(e) => setFilter((f) => ({ ...f, serviceName: e.target.value }))}
                        placeholder="any"
                        className="text-xs"
                      />
                    </div>
                    <div className="flex flex-col gap-1.5">
                      <Label htmlFor="evaluator-agent">Agent</Label>
                      <Input
                        id="evaluator-agent"
                        value={filter.agentName}
                        onChange={(e) => setFilter((f) => ({ ...f, agentName: e.target.value }))}
                        placeholder="any"
                        className="text-xs"
                      />
                    </div>
                    <div className="flex flex-col gap-1.5">
                      <Label htmlFor="evaluator-sample">Sample rate</Label>
                      <Input
                        id="evaluator-sample"
                        value={filter.sampleRate}
                        onChange={(e) => setFilter((f) => ({ ...f, sampleRate: e.target.value }))}
                        placeholder="1"
                        inputMode="decimal"
                        className="text-xs tabular-nums"
                      />
                    </div>
                  </div>
                </div>
              )}
            </>
          ) : (
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="evaluator-model">Model</Label>
              <ModelSelect id="evaluator-model" value={model} onChange={setModel} />
            </div>
          )}

          {(!editing || source === 'llm') && (
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="evaluator-judge-prompt">Judge prompt</Label>
              <Textarea
                id="evaluator-judge-prompt"
                value={judgePrompt}
                onChange={(e) => setJudgePrompt(e.target.value)}
                placeholder={editing ? 'Score the response for correctness…' : 'Instructions for the judge…'}
                rows={editing ? 6 : 5}
                className="text-xs"
              />
            </div>
          )}

          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="outline">
                Cancel
              </Button>
            </DialogClose>
            <Button type="submit" disabled={!canSubmit}>
              {editing
                ? mutation.isPending
                  ? 'Saving…'
                  : 'Save'
                : mutation.isPending
                  ? 'Creating…'
                  : 'Create evaluator'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
