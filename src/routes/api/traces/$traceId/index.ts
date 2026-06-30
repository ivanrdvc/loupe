import { createFileRoute } from '@tanstack/react-router'
import { traceResponse } from '#/features/query'
import { apiGuard } from '#/lib/auth/guards'

export const Route = createFileRoute('/api/traces/$traceId/')({
  server: {
    handlers: {
      GET: ({ request, params }) => apiGuard(request) ?? traceResponse(params.traceId, new URL(request.url)),
    },
  },
})
