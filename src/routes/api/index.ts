import { createFileRoute } from '@tanstack/react-router'
import { discoveryResponse } from '#/features/query'
import { apiGuard } from '#/lib/auth/guards'

export const Route = createFileRoute('/api/')({
  server: { handlers: { GET: ({ request }) => apiGuard(request) ?? discoveryResponse() } },
})
