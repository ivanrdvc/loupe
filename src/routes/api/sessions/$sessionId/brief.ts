import { createFileRoute } from '@tanstack/react-router'
import { sessionBriefResponse } from '#/features/query'
import { apiGuard } from '#/lib/auth/guards'

export const Route = createFileRoute('/api/sessions/$sessionId/brief')({
  server: {
    handlers: {
      GET: ({ request, params }) => apiGuard(request) ?? sessionBriefResponse(params.sessionId),
    },
  },
})
