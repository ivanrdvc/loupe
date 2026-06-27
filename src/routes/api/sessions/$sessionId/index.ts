import { createFileRoute } from '@tanstack/react-router'
import { sessionResponse } from '#/features/query'

export const Route = createFileRoute('/api/sessions/$sessionId/')({
  server: {
    handlers: {
      GET: ({ request, params }) => sessionResponse(params.sessionId, new URL(request.url)),
    },
  },
})
