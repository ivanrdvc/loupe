import { createFileRoute } from '@tanstack/react-router'
import { ingestScoreEvents, parseIngestScoreEvents } from '#/features/evaluation/server/scores'

function json(data: unknown, init?: ResponseInit): Response {
  return new Response(JSON.stringify(data), {
    ...init,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      ...init?.headers,
    },
  })
}

export const Route = createFileRoute('/api/evals/ingest')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        let body: unknown
        try {
          body = await request.json()
        } catch {
          return json({ error: 'Request body must be valid JSON' }, { status: 400 })
        }

        try {
          const events = parseIngestScoreEvents(body)
          const result = await ingestScoreEvents(events)
          return json(result, { status: 202 })
        } catch (err) {
          return json({ error: err instanceof Error ? err.message : 'Invalid eval ingest payload' }, { status: 400 })
        }
      },
    },
  },
})
