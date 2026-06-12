import { useMutation } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { Link as LinkIcon, Plus, Trash2 } from 'lucide-react'
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
} from '#/components/ui/dialog'
import { Input } from '#/components/ui/input'
import { ScrollArea } from '#/components/ui/scroll-area'
import { Textarea } from '#/components/ui/textarea'
import { ToggleGroup, ToggleGroupItem } from '#/components/ui/toggle-group'
import type { ChatMessage, ChatRole, DatasetExample, ExampleInput } from '#/features/evaluation'
import { deleteExamples, upsertExample } from '#/features/evaluation/server/datasets'
import { errMessage } from '#/lib/format'
import { looksLikeJson as isJsonShape, parseJson } from '#/lib/json'
import { cn } from '#/lib/utils'
import { Field } from './run-bits'

const isValidJson = (s: string) => parseJson(s) !== undefined
// Default an example's Expected to JSON mode only when it already holds a JSON object/array.
const looksLikeJson = (s: string | null | undefined) => {
  const t = (s ?? '').trim()
  return isJsonShape(t) && isValidJson(t)
}

export function ExampleDialog({
  datasetId,
  example,
  onClose,
  onSaved,
}: {
  datasetId: string
  example: DatasetExample | null
  onClose: () => void
  onSaved: () => void | Promise<void>
}) {
  const [input, setInput] = useState<ExampleInput>(example?.input ?? '')
  const [expected, setExpected] = useState(example?.expected ?? '')
  const [expectedMode, setExpectedMode] = useState<'text' | 'json'>(() =>
    looksLikeJson(example?.expected) ? 'json' : 'text',
  )
  const [metaPairs, setMetaPairs] = useState<Array<[string, string]>>(Object.entries(example?.metadata ?? {}))
  const [inputValid, setInputValid] = useState(true)

  const saveMutation = useMutation({
    mutationFn: () => {
      const metadata: Record<string, string> = {}
      for (const [k, v] of metaPairs) if (k.trim()) metadata[k.trim()] = v
      return upsertExample({
        data: {
          datasetId,
          exampleId: example?.id ?? null,
          input,
          expected: expected.trim() ? expected : null,
          metadata,
          sourceTraceId: example?.sourceTraceId ?? null,
        },
      })
    },
    onSuccess: async () => {
      toast.success(example ? 'Example saved' : 'Example added')
      await onSaved()
    },
    onError: (err) => toast.error(errMessage(err)),
  })

  const deleteMutation = useMutation({
    mutationFn: () => deleteExamples({ data: { datasetId, exampleIds: example ? [example.id] : [] } }),
    onSuccess: async () => {
      toast.success('Example deleted')
      await onSaved()
    },
    onError: (err) => toast.error(errMessage(err)),
  })

  const jsonInvalid = expectedMode === 'json' && expected.trim().length > 0 && !isValidJson(expected)
  const switchToJson = () => {
    setExpectedMode('json')
    const t = expected.trim()
    if (t && isValidJson(t)) setExpected(JSON.stringify(JSON.parse(t), null, 2))
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>{example ? 'Example' : 'New example'}</DialogTitle>
          <DialogDescription>
            Edit the question and its expected answer. Filling Expected makes it golden.
          </DialogDescription>
        </DialogHeader>
        <ScrollArea className="-mx-1 [&>[data-slot=scroll-area-viewport]]:max-h-[70vh]">
          <div className="flex flex-col gap-4 px-1">
            <Field label="Input">
              <InputEditor input={input} onChange={setInput} onValidChange={setInputValid} />
            </Field>
            <Field label="Expected">
              <ToggleGroup
                type="single"
                value={expectedMode}
                onValueChange={(v) => {
                  if (v === 'text') setExpectedMode('text')
                  else if (v === 'json') switchToJson()
                }}
                variant="outline"
                className="justify-start"
              >
                <ToggleGroupItem value="text">Text</ToggleGroupItem>
                <ToggleGroupItem value="json">JSON</ToggleGroupItem>
              </ToggleGroup>
              <Textarea
                value={expected}
                onChange={(e) => setExpected(e.target.value)}
                rows={expectedMode === 'json' ? 14 : 3}
                className={cn(jsonInvalid && 'border-destructive', expectedMode === 'json' && 'font-mono text-xs')}
                placeholder={
                  expectedMode === 'json'
                    ? '{ "criterion": "mentions the 30-day window" }'
                    : 'Reference answer, a tool-call assertion, or a judge rubric…'
                }
              />
              {jsonInvalid ? (
                <p className="text-[11px] text-destructive">Invalid JSON — fix it or switch to Text.</p>
              ) : (
                <p className="text-[11px] text-muted-foreground">
                  A criterion checked by the judge (not an exact string match). Text or JSON — both are passed to the
                  judge as the reference.
                </p>
              )}
            </Field>
            <Field label="Metadata">
              <MetadataEditor pairs={metaPairs} onChange={setMetaPairs} />
            </Field>
            {example?.sourceTraceId && (
              <Field label="Source">
                <Button asChild variant="link" size="sm" className="h-auto justify-start p-0 font-mono text-xs">
                  <Link to="/traces/$traceId" params={{ traceId: example.sourceTraceId }}>
                    trace {example.sourceTraceId}
                    <LinkIcon className="size-3" />
                  </Link>
                </Button>
              </Field>
            )}
          </div>
        </ScrollArea>
        <DialogFooter>
          {example && (
            <Button
              variant="ghost"
              size="icon"
              aria-label="Delete example"
              className="mr-auto text-muted-foreground hover:text-destructive"
              disabled={deleteMutation.isPending}
              onClick={() => deleteMutation.mutate()}
            >
              <Trash2 />
            </Button>
          )}
          <DialogClose asChild>
            <Button variant="outline">Cancel</Button>
          </DialogClose>
          <Button onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending || jsonInvalid || !inputValid}>
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

const CHAT_ROLES: ChatRole[] = ['system', 'user', 'assistant', 'tool']

function isMessageArray(v: unknown): v is ChatMessage[] {
  return (
    Array.isArray(v) &&
    v.length > 0 &&
    v.every(
      (m): m is ChatMessage =>
        !!m &&
        typeof m === 'object' &&
        CHAT_ROLES.includes((m as ChatMessage).role) &&
        typeof (m as ChatMessage).content === 'string',
    )
  )
}

/**
 * Plain text, or JSON for a multi-turn transcript. Text is stored as-is; a valid
 * `[{ role, content }]` array is parsed into a transcript (pretty-printed on blur).
 */
function InputEditor({
  input,
  onChange,
  onValidChange,
}: {
  input: ExampleInput
  onChange: (next: ExampleInput) => void
  onValidChange?: (valid: boolean) => void
}) {
  const [text, setText] = useState(() => (typeof input === 'string' ? input : JSON.stringify(input, null, 2)))

  const trimmed = text.trim()
  const looksJson = trimmed.startsWith('[')
  let parsed: ChatMessage[] | null = null
  let error: string | null = null
  if (looksJson) {
    try {
      const v = JSON.parse(trimmed)
      if (isMessageArray(v)) parsed = v
      else error = 'Expected an array of { role, content } messages'
    } catch {
      error = 'Invalid JSON'
    }
  }

  useEffect(() => onValidChange?.(!error), [error, onValidChange])

  const commit = (next: string) => {
    setText(next)
    const t = next.trim()
    if (t.startsWith('[')) {
      try {
        const v = JSON.parse(t)
        if (isMessageArray(v)) {
          onChange(v)
          return
        }
      } catch {
        // fall through: keep raw text so the user doesn't lose what they typed
      }
    }
    onChange(next)
  }

  return (
    <div className="flex flex-col gap-1.5">
      <Textarea
        value={text}
        onChange={(e) => commit(e.target.value)}
        onBlur={() => parsed && setText(JSON.stringify(parsed, null, 2))}
        rows={looksJson ? 8 : 3}
        className={cn('text-xs', looksJson && 'font-mono')}
        placeholder={'Plain text, or JSON multi-turn:\n[{ "role": "user", "content": "…" }]'}
      />
      {looksJson &&
        (error ? (
          <p className="text-[11px] text-destructive">⚠ {error}</p>
        ) : (
          <p className="text-[11px] text-muted-foreground">
            ✓ valid · {parsed?.length} {parsed?.length === 1 ? 'turn' : 'turns'}
          </p>
        ))}
    </div>
  )
}

/** Compact key/value editor for example metadata. */
function MetadataEditor({
  pairs,
  onChange,
}: {
  pairs: Array<[string, string]>
  onChange: (next: Array<[string, string]>) => void
}) {
  const setPair = (i: number, key: string, value: string) =>
    onChange(pairs.map((p, idx) => (idx === i ? [key, value] : p)))
  return (
    <div className="flex flex-col gap-1.5">
      {pairs.map(([k, v], i) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: metadata rows are positional
        <div key={i} className="flex items-center gap-1.5">
          <Input
            value={k}
            onChange={(e) => setPair(i, e.target.value, v)}
            placeholder="key"
            className="h-8 font-mono text-xs"
          />
          <Input
            value={v}
            onChange={(e) => setPair(i, k, e.target.value)}
            placeholder="value"
            className="h-8 font-mono text-xs"
          />
          <button
            type="button"
            className="text-muted-foreground hover:text-destructive"
            onClick={() => onChange(pairs.filter((_, idx) => idx !== i))}
          >
            <Trash2 className="size-4" />
          </button>
        </div>
      ))}
      <Button variant="outline" size="sm" className="self-start" onClick={() => onChange([...pairs, ['', '']])}>
        <Plus data-icon="inline-start" />
        Field
      </Button>
    </div>
  )
}
