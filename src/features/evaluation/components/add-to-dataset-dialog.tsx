import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Database, Plus, RotateCcw } from 'lucide-react'
import { useMemo, useState } from 'react'
import { toast } from 'sonner'
import { Button } from '#/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '#/components/ui/dialog'
import { Input } from '#/components/ui/input'
import { Label } from '#/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '#/components/ui/select'
import { Textarea } from '#/components/ui/textarea'
import type { ExampleInput } from '#/features/evaluation/dataset-types'
import { datasetInputFromSnapshot } from '#/features/evaluation/logic/dataset-input'
import { spanEvalSnapshot } from '#/features/evaluation/logic/span-eval-snapshot'
import { createDataset, getDatasetDetail, listDatasets, upsertExample } from '#/features/evaluation/server/datasets'
import { errMessage } from '#/lib/format'
import { prettyJson } from '#/lib/json'
import { queryKeys } from '#/lib/query-keys'
import type { Span } from '#/lib/spans'
import { asMessages } from '#/lib/spans/conversation'
import { defaultExpectedFromSnapshot } from './span-snapshot'

// Serialise an ExampleInput to the editable text representation: a transcript
// becomes pretty JSON (so the turns are visible), a single turn stays a string.
function inputToText(input: ExampleInput): string {
  return typeof input === 'string' ? input : prettyJson(input)
}

// Parse the editor text back: a leading `[` means a ChatMessage[] transcript.
function textToInput(text: string): ExampleInput {
  const trimmed = text.trim()
  if (trimmed.startsWith('[')) {
    try {
      const parsed = JSON.parse(trimmed)
      if (Array.isArray(parsed)) return parsed as ExampleInput
    } catch {
      // fall through — keep as string so nothing is lost
    }
  }
  return text
}

// First-class "capture this span into a dataset" surface. The editable fields
// ARE what gets stored — input (the question/turns) and expected (prefilled
// from the actual output, corrected into the golden answer).
export function AddToDatasetDialog({ span }: { span: Span }) {
  const [open, setOpen] = useState(false)
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <Button variant="outline" size="sm" onClick={() => setOpen(true)} aria-label="Add to dataset">
        <Database data-icon="inline-start" />
        Add to dataset
      </Button>
      {open && <CaptureBody span={span} onClose={() => setOpen(false)} />}
    </Dialog>
  )
}

function CaptureBody({ span, onClose }: { span: Span; onClose: () => void }) {
  const queryClient = useQueryClient()
  const snapshot = useMemo(() => spanEvalSnapshot(span), [span])
  const droppedSystem = useMemo(() => asMessages(span.llmInput).some((m) => m.role === 'system'), [span.llmInput])
  const actualExpected = useMemo(() => {
    const v = defaultExpectedFromSnapshot(snapshot)
    return v == null ? '' : prettyJson(v)
  }, [snapshot])

  const [inputText, setInputText] = useState(() => inputToText(datasetInputFromSnapshot(snapshot)))
  const [expected, setExpected] = useState(actualExpected)
  const [datasetSel, setDatasetSel] = useState('')
  const [creatingNew, setCreatingNew] = useState(false)
  const [newName, setNewName] = useState('')

  const { data: datasets } = useQuery({ queryKey: queryKeys.datasets.list(), queryFn: () => listDatasets() })

  // Detect a prior capture of this exact span in the chosen dataset, so saving
  // reads "Update row" instead of silently overwriting.
  const { data: detail } = useQuery({
    queryKey: queryKeys.datasets.detail(datasetSel),
    queryFn: () => getDatasetDetail({ data: { datasetId: datasetSel } }),
    enabled: Boolean(datasetSel) && !creatingNew,
  })
  const existingRow = detail?.examples.findIndex((e) => e.sourceSpanId === span.id) ?? -1
  const alreadyIn = existingRow >= 0

  const save = useMutation({
    mutationFn: async () => {
      let datasetId = datasetSel
      if (creatingNew) {
        const ds = await createDataset({ data: { name: newName.trim() } })
        datasetId = ds.id
      }
      await upsertExample({
        data: {
          datasetId,
          input: textToInput(inputText),
          expected: expected.trim() ? expected : null,
          sourceTraceId: span.traceId,
          sourceSpanId: span.id,
        },
      })
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.datasets.all() })
      toast.success(alreadyIn ? 'Row updated' : 'Added to dataset')
      onClose()
    },
    onError: (e) => toast.error(errMessage(e)),
  })

  const canSave = !save.isPending && (creatingNew ? newName.trim().length > 0 : datasetSel.length > 0)

  return (
    <DialogContent className="flex max-h-[85vh] w-full flex-col gap-3 overflow-hidden sm:max-w-2xl">
      <DialogHeader>
        <DialogTitle>Add to dataset</DialogTitle>
        <DialogDescription>
          Captured from this {span.operation} span ({span.model ?? 'agent'}). Edit the row, then save.
        </DialogDescription>
      </DialogHeader>

      <div className="-mx-4 min-h-0 flex-1 space-y-4 overflow-y-auto px-4 py-1">
        <Field
          label="Input"
          hint={droppedSystem ? 'System prompt dropped — the replay agent supplies its own.' : undefined}
        >
          <Textarea
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            className="max-h-56 min-h-20"
            placeholder="The question / prior turns fed to the agent at replay."
          />
        </Field>

        <Field
          label="Expected"
          hint="Prefilled from the actual output — correct it into the answer it should have given."
          action={
            expected !== actualExpected && actualExpected ? (
              <Button
                variant="ghost"
                size="sm"
                className="h-6 gap-1 px-1.5 text-[11px] text-muted-foreground"
                onClick={() => setExpected(actualExpected)}
              >
                <RotateCcw className="size-3" /> reset to actual
              </Button>
            ) : undefined
          }
        >
          <Textarea
            value={expected}
            onChange={(e) => setExpected(e.target.value)}
            className="max-h-72 min-h-24"
            placeholder="What it should have been."
          />
        </Field>
      </div>

      <DialogFooter className="flex-col items-stretch gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="flex min-w-0 flex-1 flex-col gap-1.5">
          <Label className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
            Save to dataset
          </Label>
          {creatingNew ? (
            <div className="flex items-center gap-2">
              <Input
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="New dataset name…"
                className="h-9 w-64"
                autoFocus
              />
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setCreatingNew(false)
                  setNewName('')
                }}
              >
                Cancel
              </Button>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <Select value={datasetSel} onValueChange={setDatasetSel}>
                <SelectTrigger className="w-64">
                  <SelectValue placeholder="Choose an existing dataset…" />
                </SelectTrigger>
                <SelectContent>
                  {datasets?.length ? (
                    datasets.map((d) => (
                      <SelectItem key={d.id} value={d.id}>
                        {d.name}
                        <span className="text-muted-foreground"> · {d.exampleCount}</span>
                      </SelectItem>
                    ))
                  ) : (
                    <div className="px-2 py-1.5 text-xs text-muted-foreground">No datasets yet</div>
                  )}
                </SelectContent>
              </Select>
              <span className="text-xs text-muted-foreground">or</span>
              <Button variant="outline" size="sm" onClick={() => setCreatingNew(true)}>
                <Plus data-icon="inline-start" />
                New dataset
              </Button>
            </div>
          )}
          {alreadyIn && (
            <p className="text-[11px] text-muted-foreground">
              Already row #{existingRow + 1} in this dataset — saving re-snapshots it.
            </p>
          )}
        </div>
        <Button onClick={() => save.mutate()} disabled={!canSave} className="shrink-0">
          {save.isPending ? 'Saving…' : alreadyIn ? 'Update row' : 'Save row'}
        </Button>
      </DialogFooter>
    </DialogContent>
  )
}

function Field({
  label,
  hint,
  action,
  children,
}: {
  label: string
  hint?: string
  action?: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <section className="space-y-1.5">
      <div className="flex min-h-6 items-center justify-between">
        <h3 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{label}</h3>
        {action}
      </div>
      {children}
      {hint && <p className="text-[11px] text-muted-foreground">{hint}</p>}
    </section>
  )
}
