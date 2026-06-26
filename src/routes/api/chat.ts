import { createFileRoute } from '@tanstack/react-router'
import { convertToModelMessages, stepCountIs, streamText, type UIMessage } from 'ai'
import { type ChatModelId, DEFAULT_CHAT_MODEL, isChatModelId } from '#/features/agent/chat-models'
import { resolveChatModel } from '#/features/agent/server/models'
import { type PageContext, systemPrompt } from '#/features/agent/server/prompt'
import { agentTelemetry } from '#/features/agent/server/telemetry'
import { agentTools } from '#/features/agent/server/tools'

interface ChatRequest {
  messages: UIMessage[]
  model?: string
  context?: PageContext
  conversationId?: string
}

export const Route = createFileRoute('/api/chat')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const body = (await request.json()) as ChatRequest
        const modelId: ChatModelId = isChatModelId(body.model) ? body.model : DEFAULT_CHAT_MODEL
        const result = streamText({
          model: resolveChatModel(modelId),
          system: systemPrompt(body.context ?? { pathname: '/' }),
          messages: await convertToModelMessages(body.messages),
          tools: agentTools,
          stopWhen: stepCountIs(8),
          // gpt-5 only streams a thinking summary when asked; keep effort low so it's quick.
          providerOptions: { openai: { reasoningSummary: 'auto', reasoningEffort: 'low' } },
          experimental_telemetry: agentTelemetry(body.conversationId),
        })
        return result.toUIMessageStreamResponse({ sendReasoning: true })
      },
    },
  },
})
