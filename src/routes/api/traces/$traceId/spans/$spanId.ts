import { createFileRoute } from '@tanstack/react-router'
import { spanResponse } from '#/features/query'

export const Route = createFileRoute('/api/traces/$traceId/spans/$spanId')({
  server: {
    handlers: {
      GET: ({ request, params }) => spanResponse(params.traceId, params.spanId, new URL(request.url)),
    },
  },
})
