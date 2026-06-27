import { createFileRoute } from '@tanstack/react-router'
import { discoveryResponse } from '#/features/query'

export const Route = createFileRoute('/api/')({
  server: { handlers: { GET: () => discoveryResponse() } },
})
