import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from '#/components/ui/select'
import { JUDGE_MODELS, type JudgeProvider } from '#/lib/eval/models'

const PROVIDER_LABEL: Record<JudgeProvider, string> = {
  anthropic: 'Anthropic',
  openai: 'OpenAI',
  azure: 'Azure OpenAI',
}

const PROVIDERS: JudgeProvider[] = ['anthropic', 'openai', 'azure']

/** Judge-model picker backed by the canonical list in `lib/eval/models`. */
export function ModelSelect({
  value,
  onChange,
  id,
}: {
  value: string
  onChange: (model: string) => void
  id?: string
}) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger id={id} className="font-mono text-xs">
        <SelectValue placeholder="Pick a model" />
      </SelectTrigger>
      <SelectContent>
        {PROVIDERS.map((provider) => (
          <SelectGroup key={provider}>
            <SelectLabel>{PROVIDER_LABEL[provider]}</SelectLabel>
            {JUDGE_MODELS.filter((m) => m.provider === provider).map((m) => (
              <SelectItem key={m.id} value={m.id} className="font-mono text-xs">
                {m.label}
              </SelectItem>
            ))}
          </SelectGroup>
        ))}
      </SelectContent>
    </Select>
  )
}
