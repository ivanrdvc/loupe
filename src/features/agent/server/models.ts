import { createAzure } from '@ai-sdk/azure'
import { createOpenAI } from '@ai-sdk/openai'
import type { LanguageModel } from 'ai'
import type { ChatModelId } from '../chat-models'

const AZURE_NANO_DEPLOYMENT = process.env.AZURE_OPENAI_NANO_DEPLOYMENT ?? 'gpt-5-nano'

// Mirrors src/features/evaluation/server/judge.ts: BYO key from env, Responses
// API for gpt-5 reasoning, Azure via AZURE_OPENAI_* (resource name or endpoint).
export function resolveChatModel(id: ChatModelId): LanguageModel {
  if (id === 'azure-gpt-5-nano') {
    const apiKey = process.env.AZURE_OPENAI_API_KEY
    if (!apiKey) throw new Error('Set AZURE_OPENAI_API_KEY to use the Azure agent model.')
    const resourceName = process.env.AZURE_OPENAI_RESOURCE_NAME
    const baseURL = process.env.AZURE_OPENAI_ENDPOINT
    if (!resourceName && !baseURL) {
      throw new Error('Set AZURE_OPENAI_RESOURCE_NAME (or AZURE_OPENAI_ENDPOINT) for the Azure agent model.')
    }
    const azure = createAzure({ apiKey, resourceName, baseURL, apiVersion: process.env.AZURE_OPENAI_API_VERSION })
    return azure.responses(AZURE_NANO_DEPLOYMENT)
  }
  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) throw new Error('Set OPENAI_API_KEY to use the agent.')
  return createOpenAI({ apiKey }).responses('gpt-5-nano')
}
