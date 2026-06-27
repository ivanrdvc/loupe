import { createFileRoute } from '@tanstack/react-router'
import { conversationResponse } from '#/features/query'

export const Route = createFileRoute('/api/traces/$traceId/conversation')({
  server: {
    handlers: {
      GET: ({ request, params }) => conversationResponse(params.traceId, new URL(request.url)),
    },
  },
})
