import { createFileRoute } from '@tanstack/react-router'
import { createAgentUIStreamResponse, type UIMessage } from 'ai'
import type { MentionRef, PageContext } from '#/features/agent/logic/request'
import { getLoupeAgent } from '#/features/agent/server/agent'

interface ChatRequest {
  messages: UIMessage[]
  model?: string
  context?: PageContext
  sessionId?: string
  mentions?: MentionRef[]
}

export const Route = createFileRoute('/api/chat')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const body = (await request.json()) as ChatRequest
        return createAgentUIStreamResponse({
          agent: getLoupeAgent(),
          uiMessages: body.messages,
          options: {
            context: body.context,
            mentions: body.mentions,
            model: body.model,
            sessionId: body.sessionId,
          },
          sendReasoning: true,
          // Default masking hides the cause as "An error occurred."; log it and
          // surface a real message so missing keys / tool failures are diagnosable.
          onError: (error) => {
            console.error('[agent chat]', error)
            return error instanceof Error ? error.message : 'Something went wrong.'
          },
        })
      },
    },
  },
})
