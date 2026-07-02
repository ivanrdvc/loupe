import { createFileRoute } from '@tanstack/react-router'
import { runSearch } from '#/features/query'
import { apiGuard } from '#/lib/auth/guards'

export const Route = createFileRoute('/api/search')({
  server: {
    handlers: {
      GET: ({ request }) => apiGuard(request) ?? runSearch(new URL(request.url).searchParams),
    },
  },
})
