import { Input } from '#/components/ui/input'
import { Label } from '#/components/ui/label'
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from '#/components/ui/select'
import { Slider } from '#/components/ui/slider'
import type { ModelParams } from '../-types'

const MODELS_BY_PROVIDER: { provider: string; models: string[] }[] = [
  { provider: 'OpenAI', models: ['gpt-4o', 'gpt-4o-mini'] },
  { provider: 'Anthropic', models: ['claude-opus-4-7', 'claude-sonnet-4-6', 'claude-haiku-4-5-20251001'] },
  { provider: 'Google', models: ['gemini-2.5-pro'] },
]

export function ModelParamsPanel({
  value,
  onChange,
  readOnly,
}: {
  value: ModelParams
  onChange?: (next: ModelParams) => void
  readOnly?: boolean
}) {
  const handle = (next: ModelParams) => {
    if (!readOnly) onChange?.(next)
  }
  return (
    <div className="flex flex-col gap-3">
      <h3 className="text-sm font-medium">Model</h3>
      <div className="flex flex-col gap-4">
        <div className="grid gap-3">
          <Label htmlFor="model-select">Model</Label>
          <Select value={value.model} onValueChange={(model) => handle({ ...value, model })} disabled={readOnly}>
            <SelectTrigger id="model-select">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {MODELS_BY_PROVIDER.map((group) => (
                <SelectGroup key={group.provider}>
                  <SelectLabel>{group.provider}</SelectLabel>
                  {group.models.map((model) => (
                    <SelectItem key={model} value={model}>
                      {model}
                    </SelectItem>
                  ))}
                </SelectGroup>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="grid gap-3">
          <div className="flex items-center justify-between">
            <Label htmlFor="model-temperature">Temperature</Label>
            <span className="tabular-nums text-sm text-muted-foreground">{(value.temperature ?? 0).toFixed(2)}</span>
          </div>
          <Slider
            id="model-temperature"
            min={0}
            max={2}
            step={0.1}
            value={[value.temperature ?? 0]}
            onValueChange={([next]) => handle({ ...value, temperature: next })}
            disabled={readOnly}
          />
        </div>
        <div className="grid gap-3">
          <div className="flex items-center justify-between">
            <Label htmlFor="model-top-p">Top P</Label>
            <span className="tabular-nums text-sm text-muted-foreground">{(value.topP ?? 1).toFixed(2)}</span>
          </div>
          <Slider
            id="model-top-p"
            min={0}
            max={1}
            step={0.05}
            value={[value.topP ?? 1]}
            onValueChange={([next]) => handle({ ...value, topP: next })}
            disabled={readOnly}
          />
        </div>
        <div className="grid gap-3">
          <Label htmlFor="model-max-tokens">Max tokens</Label>
          <Input
            id="model-max-tokens"
            type="number"
            min="1"
            value={value.maxTokens ?? ''}
            onChange={(e) =>
              handle({
                ...value,
                maxTokens: e.target.value === '' ? undefined : Number(e.target.value),
              })
            }
            disabled={readOnly}
          />
        </div>
      </div>
    </div>
  )
}
