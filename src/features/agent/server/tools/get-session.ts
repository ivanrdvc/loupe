import { tool } from 'ai'
import { z } from 'zod'
import { sessionSummary } from './shared'

/**
 * Summarize a session (conversation / multi-trace run) by id.
 */
export const getSessionTool = (origin?: string) =>
  tool({
    description:
      'Summarize a session (conversation / multi-trace run) by id: title, trace count, duration, errors, agents, models. Use for "what happened this session" or "any errors".',
    inputSchema: z.object({
      sessionId: z.string().describe('The session id.'),
      detail: z
        .boolean()
        .optional()
        .describe(
          'Set true only for "what was slow" or "where did the tokens go" — adds tokens, cost, slowest spans, and the step path. Omit for a normal summary.',
        ),
    }),
    execute: async ({ sessionId, detail }) => {
      const s = await sessionSummary(sessionId, origin, detail)
      return s ? { found: true as const, ...s } : { found: false as const }
    },
  })
