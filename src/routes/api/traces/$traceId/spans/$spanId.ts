import { createFileRoute } from '@tanstack/react-router'
import { spanResponse } from '#/features/query'
import { apiGuard } from '#/lib/auth/guards'

export const Route = createFileRoute('/api/traces/$traceId/spans/$spanId')({
  server: {
    handlers: {
      GET: ({ request, params }) =>
        apiGuard(request) ?? spanResponse(params.traceId, params.spanId, new URL(request.url)),
    },
  },
})
