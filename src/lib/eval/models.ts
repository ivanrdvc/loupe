// Canonical set of LLM-judge models loupe supports. Single source of truth so
// every model picker (evaluator create/edit) and the server judge agree on the
// same ids, labels, and provider routing.

export type JudgeProvider = 'anthropic' | 'openai'

export type JudgeModel = {
  id: string
  label: string
  provider: JudgeProvider
}

export const JUDGE_MODELS: JudgeModel[] = [
  { id: 'claude-haiku-4-5', label: 'Claude Haiku 4.5', provider: 'anthropic' },
  { id: 'claude-sonnet-4-6', label: 'Claude Sonnet 4.6', provider: 'anthropic' },
  { id: 'gpt-4o-mini', label: 'GPT-4o mini', provider: 'openai' },
  { id: 'gpt-4.1', label: 'GPT-4.1', provider: 'openai' },
  { id: 'gpt-5', label: 'GPT-5', provider: 'openai' },
  { id: 'gpt-5.4-nano', label: 'GPT-5.4 nano', provider: 'openai' },
  { id: 'gpt-5.4-mini', label: 'GPT-5.4 mini', provider: 'openai' },
]

export const DEFAULT_JUDGE_MODEL = 'gpt-4o-mini'

const BY_ID = new Map(JUDGE_MODELS.map((m) => [m.id, m]))

// Provider is declared on each model entry — look it up. Unknown ids (e.g. a
// custom JUDGE_MODEL env override) fall back to OpenAI.
export function judgeModelProvider(id: string): JudgeProvider {
  return BY_ID.get(id)?.provider ?? 'openai'
}

export function judgeModelLabel(id: string): string {
  return BY_ID.get(id)?.label ?? id
}
