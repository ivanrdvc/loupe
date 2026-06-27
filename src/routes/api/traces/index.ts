import { createFileRoute } from '@tanstack/react-router'
import { runSearch } from '#/features/query'

export const Route = createFileRoute('/api/traces/')({
  server: {
    handlers: {
      // The REST-natural list door — same engine as /api/search, pinned to traces.
      GET: ({ request }) => runSearch(new URL(request.url).searchParams, 'traces'),
    },
  },
})
