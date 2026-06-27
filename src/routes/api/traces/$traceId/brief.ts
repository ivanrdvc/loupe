import { createFileRoute } from '@tanstack/react-router'
import { traceBriefResponse } from '#/features/query'

export const Route = createFileRoute('/api/traces/$traceId/brief')({
  server: {
    handlers: {
      GET: ({ params }) => traceBriefResponse(params.traceId),
    },
  },
})
