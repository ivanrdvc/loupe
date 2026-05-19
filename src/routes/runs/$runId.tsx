import { createFileRoute, redirect } from '@tanstack/react-router'

export const Route = createFileRoute('/runs/$runId')({
  beforeLoad: ({ params }) => {
    throw redirect({
      to: '/traces/$traceId',
      params: { traceId: params.runId },
    })
  },
})
