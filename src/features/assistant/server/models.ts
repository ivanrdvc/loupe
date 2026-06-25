import { createAzure } from '@ai-sdk/azure'
import { openai } from '@ai-sdk/openai'
import type { LanguageModel } from 'ai'
import type { ChatModelId } from '../models'

/** Azure deployment backing the nano model; defaults to the OpenAI model id. */
const AZURE_NANO_DEPLOYMENT = process.env.AZURE_OPENAI_NANO_DEPLOYMENT ?? 'gpt-5-nano'

// Built from loupe's AZURE_OPENAI_* convention (resource name or full endpoint).
let azureProvider: ReturnType<typeof createAzure> | null = null
function azure() {
  if (!azureProvider) {
    const endpoint = process.env.AZURE_OPENAI_ENDPOINT?.replace(/\/$/, '')
    azureProvider = createAzure({
      apiKey: process.env.AZURE_OPENAI_API_KEY,
      resourceName: process.env.AZURE_OPENAI_RESOURCE_NAME,
      apiVersion: process.env.AZURE_OPENAI_API_VERSION,
      ...(endpoint ? { baseURL: `${endpoint}/openai/deployments` } : {}),
    })
  }
  return azureProvider
}

export function resolveChatModel(id: ChatModelId): LanguageModel {
  switch (id) {
    case 'azure-gpt-5-nano':
      return azure()(AZURE_NANO_DEPLOYMENT)
    default:
      return openai('gpt-5-nano')
  }
}
