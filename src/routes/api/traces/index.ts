import { createFileRoute } from '@tanstack/react-router'
import { runSearch } from '#/features/query'
import { apiGuard } from '#/lib/auth/guards'

export const Route = createFileRoute('/api/traces/')({
  server: {
    handlers: {
      // The REST-natural list door — same engine as /api/search, pinned to traces.
      GET: ({ request }) => apiGuard(request) ?? runSearch(new URL(request.url).searchParams, 'traces'),
    },
  },
})
