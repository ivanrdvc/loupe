import { useState } from 'react'
import { Button } from '#/components/ui/button'
import { Input } from '#/components/ui/input'
import { Slider } from '#/components/ui/slider'
import { Textarea } from '#/components/ui/textarea'
import { ToggleGroup, ToggleGroupItem } from '#/components/ui/toggle-group'
import type { ScoreConfig } from '#/lib/eval/evaluation'
import { cn } from '#/lib/utils'

export type ScoreDraft = { value: number | null; label: string | null; explanation: string | null }

// One control, four renderings — chosen from the dimension's score_config.dataType.
export function ScoreInput({
  config,
  initial,
  pending,
  onSubmit,
  onCancel,
}: {
  config: ScoreConfig
  initial?: ScoreDraft
  pending?: boolean
  onSubmit: (draft: ScoreDraft) => void
  onCancel?: () => void
}) {
  const [value, setValue] = useState<number | null>(initial?.value ?? null)
  const [label, setLabel] = useState<string | null>(initial?.label ?? null)
  const [text, setText] = useState(initial?.label ?? '')
  const [explanation, setExplanation] = useState(initial?.explanation ?? '')

  const canSubmit = (() => {
    switch (config.dataType) {
      case 'boolean':
      case 'numeric':
        return value != null
      case 'categorical':
        return label != null
      case 'text':
        return text.trim().length > 0
    }
  })()

  const submit = () => {
    if (!canSubmit) return
    const draft: ScoreDraft =
      config.dataType === 'text'
        ? { value: null, label: text.trim(), explanation: explanation.trim() || null }
        : config.dataType === 'categorical'
          ? { value: null, label, explanation: explanation.trim() || null }
          : { value, label: null, explanation: explanation.trim() || null }
    onSubmit(draft)
  }

  return (
    <div className="flex flex-col gap-2">
      <Control
        config={config}
        value={value}
        label={label}
        text={text}
        onValue={setValue}
        onLabel={setLabel}
        onText={setText}
      />
      <Textarea
        value={explanation}
        onChange={(e) => setExplanation(e.target.value)}
        placeholder="Reason (optional)"
        rows={2}
      />
      <div className="flex items-center justify-end gap-2">
        {onCancel && (
          <Button size="sm" variant="ghost" onClick={onCancel} disabled={pending}>
            Cancel
          </Button>
        )}
        <Button size="sm" onClick={submit} disabled={!canSubmit || pending}>
          {pending ? 'Saving…' : 'Save score'}
        </Button>
      </div>
    </div>
  )
}

function Control({
  config,
  value,
  label,
  text,
  onValue,
  onLabel,
  onText,
}: {
  config: ScoreConfig
  value: number | null
  label: string | null
  text: string
  onValue: (v: number | null) => void
  onLabel: (v: string | null) => void
  onText: (v: string) => void
}) {
  if (config.dataType === 'boolean') {
    return (
      <ToggleGroup
        type="single"
        value={value === 1 ? 'good' : value === 0 ? 'bad' : ''}
        onValueChange={(v) => onValue(v === 'good' ? 1 : v === 'bad' ? 0 : null)}
        variant="outline"
        className="justify-start"
      >
        <ToggleGroupItem value="good" aria-label="Good">
          👍 Good
        </ToggleGroupItem>
        <ToggleGroupItem value="bad" aria-label="Bad">
          👎 Bad
        </ToggleGroupItem>
      </ToggleGroup>
    )
  }

  if (config.dataType === 'categorical') {
    const categories = config.categories ?? []
    return (
      <ToggleGroup
        type="single"
        value={label ?? ''}
        onValueChange={(v) => onLabel(v || null)}
        variant="outline"
        className="flex-wrap justify-start"
      >
        {categories.map((c) => (
          <ToggleGroupItem key={c} value={c} className="capitalize">
            {c}
          </ToggleGroupItem>
        ))}
      </ToggleGroup>
    )
  }

  if (config.dataType === 'numeric') {
    const min = config.minValue ?? 1
    const max = config.maxValue ?? 5
    const integerScale = Number.isInteger(min) && Number.isInteger(max) && max - min <= 10
    if (integerScale) {
      const steps = Array.from({ length: max - min + 1 }, (_, i) => min + i)
      return (
        <div className="flex flex-wrap gap-1.5">
          {steps.map((n) => (
            <button
              key={n}
              type="button"
              onClick={() => onValue(n)}
              className={cn(
                'flex size-8 items-center justify-center rounded-md border text-sm tabular-nums transition-colors',
                value === n ? 'border-primary bg-primary text-primary-foreground' : 'hover:bg-muted',
              )}
            >
              {n}
            </button>
          ))}
        </div>
      )
    }
    return (
      <div className="flex items-center gap-3">
        <Slider
          min={min}
          max={max}
          step={(max - min) / 100 || 0.01}
          value={[value ?? min]}
          onValueChange={([v]) => onValue(v)}
          className="flex-1"
        />
        <span className="w-12 text-right text-sm tabular-nums text-muted-foreground">{(value ?? min).toFixed(2)}</span>
      </div>
    )
  }

  return <Input value={text} onChange={(e) => onText(e.target.value)} placeholder="Short verdict" />
}
