import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { toast } from 'sonner'
import { Button } from '#/components/ui/button'
import { Input } from '#/components/ui/input'
import { Label } from '#/components/ui/label'
import { ToggleGroup, ToggleGroupItem } from '#/components/ui/toggle-group'
import { upsertScoreConfig } from '#/features/evaluation/server/scores'
import {
  defaultCategoryPolarity,
  SCORE_DATA_TYPES,
  type ScoreConfig,
  type ScoreDataType,
  type ScoreDirection,
} from '#/lib/eval/evaluation'
import { queryKeys } from '#/lib/query-keys'

// Inline score_config create — keeps a dimension's vocab consistent across human + judge.
export function DimensionForm({ onCreated, onCancel }: { onCreated: (c: ScoreConfig) => void; onCancel?: () => void }) {
  const queryClient = useQueryClient()
  const [name, setName] = useState('')
  const [dataType, setDataType] = useState<ScoreDataType>('boolean')
  const [categories, setCategories] = useState('correct, incorrect')
  const [minValue, setMinValue] = useState('1')
  const [maxValue, setMaxValue] = useState('5')
  const [direction, setDirection] = useState<ScoreDirection>('higher_better')
  // Per-category overrides; effective polarity falls back to the lexicon seed.
  const [polarity, setPolarity] = useState<Record<string, 'good' | 'bad' | 'neutral'>>({})

  const parsedCategories =
    dataType === 'categorical'
      ? categories
          .split(',')
          .map((c) => c.trim())
          .filter(Boolean)
      : []

  const effectivePolarity = (cat: string) => polarity[cat] ?? defaultCategoryPolarity(cat)
  const passLabels = parsedCategories.filter((c) => effectivePolarity(c) === 'good')
  const failLabels = parsedCategories.filter((c) => effectivePolarity(c) === 'bad')

  const numMin = Number(minValue)
  const numMax = Number(maxValue)
  const numericValid = dataType !== 'numeric' || (Number.isFinite(numMin) && Number.isFinite(numMax) && numMax > numMin)

  const mutation = useMutation({
    mutationFn: () =>
      upsertScoreConfig({
        data: {
          name: name.trim(),
          dataType,
          categories: dataType === 'categorical' ? parsedCategories : null,
          passLabels: dataType === 'categorical' ? passLabels : null,
          failLabels: dataType === 'categorical' ? failLabels : null,
          direction: dataType === 'numeric' ? direction : 'higher_better',
          minValue: dataType === 'numeric' ? numMin : null,
          maxValue: dataType === 'numeric' ? numMax : null,
        },
      }),
    onSuccess: async (config) => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.scores.configs() })
      toast.success(`Dimension "${config.name}" created`)
      onCreated(config)
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : 'Could not create dimension'),
  })

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="dim-name">Name</Label>
        <Input
          id="dim-name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="tool_selection"
          autoFocus
        />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label>Type</Label>
        <ToggleGroup
          type="single"
          value={dataType}
          onValueChange={(v) => v && setDataType(v as ScoreDataType)}
          variant="outline"
          className="justify-start"
        >
          {SCORE_DATA_TYPES.map((t) => (
            <ToggleGroupItem key={t} value={t} className="capitalize">
              {t}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
      </div>
      {dataType === 'categorical' && (
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="dim-cats">Categories (comma-separated)</Label>
          <Input id="dim-cats" value={categories} onChange={(e) => setCategories(e.target.value)} />
          {categories.trim() && parsedCategories.length === 0 && (
            <span className="text-xs text-destructive">Enter at least one category.</span>
          )}
          {parsedCategories.length > 0 && (
            <div className="mt-1 flex flex-col gap-1">
              <Label className="text-xs text-muted-foreground">Polarity — which count as pass / fail</Label>
              {parsedCategories.map((cat) => (
                <div key={cat} className="flex items-center justify-between gap-2">
                  <span className="truncate text-sm">{cat}</span>
                  <ToggleGroup
                    type="single"
                    value={effectivePolarity(cat)}
                    onValueChange={(v) => v && setPolarity((p) => ({ ...p, [cat]: v as 'good' | 'bad' | 'neutral' }))}
                    variant="outline"
                  >
                    <ToggleGroupItem value="good" aria-label="Pass">
                      👍
                    </ToggleGroupItem>
                    <ToggleGroupItem value="neutral" aria-label="Neutral">
                      –
                    </ToggleGroupItem>
                    <ToggleGroupItem value="bad" aria-label="Fail">
                      👎
                    </ToggleGroupItem>
                  </ToggleGroup>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
      {dataType === 'numeric' && (
        <div className="flex flex-col gap-3">
          <div className="flex items-end gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="dim-min">Min</Label>
              <Input
                id="dim-min"
                type="number"
                value={minValue}
                onChange={(e) => setMinValue(e.target.value)}
                className="w-24"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="dim-max">Max</Label>
              <Input
                id="dim-max"
                type="number"
                value={maxValue}
                onChange={(e) => setMaxValue(e.target.value)}
                className="w-24"
              />
            </div>
          </div>
          {!numericValid && <span className="text-xs text-destructive">Max must be greater than min.</span>}
          <div className="flex flex-col gap-1.5">
            <Label>Direction</Label>
            <ToggleGroup
              type="single"
              value={direction}
              onValueChange={(v) => v && setDirection(v as ScoreDirection)}
              variant="outline"
              className="justify-start"
            >
              <ToggleGroupItem value="higher_better">Higher is better</ToggleGroupItem>
              <ToggleGroupItem value="lower_better">Lower is better</ToggleGroupItem>
            </ToggleGroup>
          </div>
        </div>
      )}
      <div className="flex items-center justify-end gap-2">
        {onCancel && (
          <Button size="sm" variant="ghost" onClick={onCancel} disabled={mutation.isPending}>
            Cancel
          </Button>
        )}
        <Button
          size="sm"
          onClick={() => mutation.mutate()}
          disabled={
            !name.trim() ||
            mutation.isPending ||
            !numericValid ||
            (dataType === 'categorical' && parsedCategories.length === 0)
          }
        >
          {mutation.isPending ? 'Creating…' : 'Create dimension'}
        </Button>
      </div>
    </div>
  )
}
