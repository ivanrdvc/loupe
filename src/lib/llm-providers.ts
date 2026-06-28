import { createAnthropic } from '@ai-sdk/anthropic'
import { createAzure } from '@ai-sdk/azure'
import { createOpenAI } from '@ai-sdk/openai'
import type { LanguageModel } from 'ai'

/**
 * BYO-key provider clients shared by the agent and the eval judge. Each builder
 * validates only its own provider's env, so a user who configured one provider
 * never trips an error meant for another.
 */

/**
 * OpenAI Responses model from `OPENAI_API_KEY`.
 */
export function openaiResponses(model: string): LanguageModel {
  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) throw new Error('Set OPENAI_API_KEY to use an OpenAI model.')
  return createOpenAI({ apiKey }).responses(model)
}

/**
 * Azure OpenAI Responses deployment from `AZURE_OPENAI_*` (resource name or endpoint).
 */
export function azureResponses(deployment: string): LanguageModel {
  const apiKey = process.env.AZURE_OPENAI_API_KEY
  if (!apiKey) throw new Error('Set AZURE_OPENAI_API_KEY to use an Azure OpenAI model.')
  const resourceName = process.env.AZURE_OPENAI_RESOURCE_NAME
  const baseURL = process.env.AZURE_OPENAI_ENDPOINT
  if (!resourceName && !baseURL) {
    throw new Error('Set AZURE_OPENAI_RESOURCE_NAME (or AZURE_OPENAI_ENDPOINT) to use an Azure OpenAI model.')
  }
  const azure = createAzure({ apiKey, resourceName, baseURL, apiVersion: process.env.AZURE_OPENAI_API_VERSION })
  return azure.responses(deployment)
}

/**
 * Anthropic model from `ANTHROPIC_API_KEY`.
 */
export function anthropicModel(model: string): LanguageModel {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) throw new Error('Set ANTHROPIC_API_KEY to use a Claude model.')
  return createAnthropic({ apiKey })(model)
}
