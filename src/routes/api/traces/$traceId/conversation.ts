import { createFileRoute } from '@tanstack/react-router'
import { conversationResponse } from '#/features/query'
import { apiGuard } from '#/lib/auth/guards'

export const Route = createFileRoute('/api/traces/$traceId/conversation')({
  server: {
    handlers: {
      GET: ({ request, params }) => apiGuard(request) ?? conversationResponse(params.traceId, new URL(request.url)),
    },
  },
})
