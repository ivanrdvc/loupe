import { createFileRoute } from '@tanstack/react-router'
import { sessionResponse } from '#/features/query'
import { apiGuard } from '#/lib/auth/guards'

export const Route = createFileRoute('/api/sessions/$sessionId/')({
  server: {
    handlers: {
      GET: ({ request, params }) => apiGuard(request) ?? sessionResponse(params.sessionId, new URL(request.url)),
    },
  },
})
