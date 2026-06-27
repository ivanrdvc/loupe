import { createFileRoute } from '@tanstack/react-router'
import { traceResponse } from '#/features/query'

export const Route = createFileRoute('/api/traces/$traceId/')({
  server: {
    handlers: {
      GET: ({ request, params }) => traceResponse(params.traceId, new URL(request.url)),
    },
  },
})
