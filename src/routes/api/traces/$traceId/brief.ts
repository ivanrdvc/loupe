import { createFileRoute } from '@tanstack/react-router'
import { traceBriefResponse } from '#/features/query'
import { apiGuard } from '#/lib/auth/guards'

export const Route = createFileRoute('/api/traces/$traceId/brief')({
  server: {
    handlers: {
      GET: ({ request, params }) => apiGuard(request) ?? traceBriefResponse(params.traceId),
    },
  },
})
