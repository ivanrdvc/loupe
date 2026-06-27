import { createFileRoute } from '@tanstack/react-router'
import { runSearch } from '#/features/query'

export const Route = createFileRoute('/api/search')({
  server: {
    handlers: {
      GET: ({ request }) => runSearch(new URL(request.url).searchParams),
    },
  },
})
