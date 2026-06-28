import type { LanguageModel } from 'ai'
import { azureResponses, openaiResponses } from '#/lib/llm-providers'
import type { ChatModelId } from '../chat-models'

/**
 * Lazy id → model map. Only the selected model's builder runs, so an unconfigured
 * provider never throws for a user who set up the other one.
 */
const MODELS: Record<ChatModelId, () => LanguageModel> = {
  'gpt-5-nano': () => openaiResponses('gpt-5-nano'),
  'azure-gpt-5-nano': () => azureResponses(process.env.AZURE_OPENAI_NANO_DEPLOYMENT ?? 'gpt-5-nano'),
}

export const resolveChatModel = (id: ChatModelId): LanguageModel => MODELS[id]()
