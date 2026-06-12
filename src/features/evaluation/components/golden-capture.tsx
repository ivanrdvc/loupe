import { useEffect, useMemo, useState } from 'react'
import { AddToDatasetButton } from '#/features/evaluation/components/add-to-dataset'
import { datasetInputFromSnapshot } from '#/features/evaluation/logic/dataset-input'
import { type JsonValue, prettyJson } from '#/lib/json'
import { cn } from '#/lib/utils'
import { ExpectedOutputEditor } from './expected-output-editor'
import { defaultExpectedFromSnapshot } from './span-snapshot'

type Props = {
  input: Record<string, JsonValue>
  sourceTraceId?: string | null
  sourceSpanId?: string | null
  /** Pulse the panel after a bad human score. */
  highlighted?: boolean
  className?: string
}

const expectedString = (input: Record<string, JsonValue>): string | null => {
  const v = defaultExpectedFromSnapshot(input)
  return v == null ? null : prettyJson(v)
}

// Edit expected output and add input + golden expected to a dataset in one gesture.
export function GoldenCapturePanel({ input, sourceTraceId, sourceSpanId, highlighted, className }: Props) {
  // Start empty — the expected is what it *should* have been, not the actual output.
  const [expected, setExpected] = useState<string | null>(null)
  // biome-ignore lint/correctness/useExhaustiveDependencies: reset the draft when the captured span changes
  useEffect(() => setExpected(null), [sourceTraceId, sourceSpanId])

  const actual = expectedString(input)
  const datasetItems = useMemo(
    () => [
      {
        sourceTraceId: sourceTraceId ?? null,
        sourceSpanId: sourceSpanId ?? null,
        input: datasetInputFromSnapshot(input),
        expected,
      },
    ],
    [input, expected, sourceTraceId, sourceSpanId],
  )

  return (
    <div
      className={cn(
        'rounded-lg border bg-card px-3 py-3',
        highlighted && 'border-amber-500/40 ring-1 ring-amber-500/20',
        className,
      )}
    >
      <div className="mb-2 flex items-center justify-between gap-2">
        <h3 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Golden output</h3>
        <AddToDatasetButton size="sm" variant="secondary" label="Add to dataset" items={datasetItems} />
      </div>
      {actual != null && (
        <div className="mb-2 rounded-md bg-muted/40 px-2 py-1.5">
          <div className="flex items-center justify-between gap-2">
            <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Actual output</p>
            <button
              type="button"
              className="text-[10px] text-muted-foreground hover:text-foreground"
              onClick={() => setExpected(actual)}
            >
              Use as expected
            </button>
          </div>
          <pre className="mt-0.5 max-h-24 overflow-auto whitespace-pre-wrap font-mono text-[11px] text-foreground/80">
            {actual}
          </pre>
        </div>
      )}
      <p className="mb-1.5 text-xs text-muted-foreground">
        Edit what it should have been — saved as the dataset expected.
      </p>
      <ExpectedOutputEditor value={expected} onChange={setExpected} autoFocus={highlighted} />
    </div>
  )
}
