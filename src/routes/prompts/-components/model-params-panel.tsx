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
import type { ModelParams } from '../-types'

const MODELS_BY_PROVIDER: { provider: string; models: string[] }[] = [
  { provider: 'OpenAI', models: ['gpt-4o', 'gpt-4o-mini'] },
  { provider: 'Anthropic', models: ['claude-opus-4-7', 'claude-sonnet-4-6', 'claude-haiku-4-5-20251001'] },
  { provider: 'Google', models: ['gemini-2.5-pro'] },
]

export function ModelParamsPanel({ value, onChange }: { value: ModelParams; onChange: (next: ModelParams) => void }) {
  return (
    <div className="flex flex-col gap-3">
      <h3 className="text-sm font-medium">Model</h3>
      <div className="flex flex-col gap-2.5">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="model-select" className="text-xs">
            Model
          </Label>
          <Select value={value.model} onValueChange={(model) => onChange({ ...value, model })}>
            <SelectTrigger id="model-select" size="sm">
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
        <div className="grid grid-cols-2 gap-2">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="model-temperature" className="text-xs">
              Temperature
            </Label>
            <Input
              id="model-temperature"
              type="number"
              step="0.1"
              min="0"
              max="2"
              value={value.temperature ?? ''}
              onChange={(e) =>
                onChange({
                  ...value,
                  temperature: e.target.value === '' ? undefined : Number(e.target.value),
                })
              }
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="model-max-tokens" className="text-xs">
              Max tokens
            </Label>
            <Input
              id="model-max-tokens"
              type="number"
              min="1"
              value={value.maxTokens ?? ''}
              onChange={(e) =>
                onChange({
                  ...value,
                  maxTokens: e.target.value === '' ? undefined : Number(e.target.value),
                })
              }
            />
          </div>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="model-top-p" className="text-xs">
            Top P
          </Label>
          <Input
            id="model-top-p"
            type="number"
            step="0.05"
            min="0"
            max="1"
            value={value.topP ?? ''}
            onChange={(e) =>
              onChange({
                ...value,
                topP: e.target.value === '' ? undefined : Number(e.target.value),
              })
            }
          />
        </div>
      </div>
    </div>
  )
}
