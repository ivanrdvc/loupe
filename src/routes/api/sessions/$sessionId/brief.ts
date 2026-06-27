import { createFileRoute } from '@tanstack/react-router'
import { sessionBriefResponse } from '#/features/query'

export const Route = createFileRoute('/api/sessions/$sessionId/brief')({
  server: {
    handlers: {
      GET: ({ params }) => sessionBriefResponse(params.sessionId),
    },
  },
})
