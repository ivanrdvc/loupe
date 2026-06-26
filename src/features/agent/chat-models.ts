export type ChatModelId = 'gpt-5-nano' | 'azure-gpt-5-nano'

export interface ChatModel {
  id: ChatModelId
  label: string
  provider: 'OpenAI' | 'Azure'
}

export const CHAT_MODELS: readonly ChatModel[] = [
  { id: 'gpt-5-nano', label: 'GPT-5 nano', provider: 'OpenAI' },
  { id: 'azure-gpt-5-nano', label: 'GPT-5 nano (Azure)', provider: 'Azure' },
]

export const DEFAULT_CHAT_MODEL: ChatModelId = 'gpt-5-nano'

export function isChatModelId(value: unknown): value is ChatModelId {
  return typeof value === 'string' && CHAT_MODELS.some((m) => m.id === value)
}
