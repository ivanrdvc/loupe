import { tool } from 'ai'
import { z } from 'zod'
import { traceSummary } from './shared'

/**
 * Summarize one end-to-end trace by id — for "explain this trace" / "why did it fail".
 */
export const getTraceTool = (origin?: string) =>
  tool({
    description:
      'Summarize one trace (end-to-end run) by id. Returns a headline (duration, errors with exception type + trimmed stack, agents, models). Use for "explain this trace" or "why did it fail". Metadata only — point the user at the link for raw messages and tool I/O.',
    inputSchema: z.object({
      traceId: z.string().describe('The trace id.'),
      detail: z
        .boolean()
        .optional()
        .describe(
          'Set true only for "what was slow", "where did the tokens go", or to walk the step path — adds tokens, cost, slowest spans, and the ordered steps. Omit for a normal summary.',
        ),
    }),
    execute: async ({ traceId, detail }) => {
      const s = await traceSummary(traceId, origin, detail)
      return s ? { found: true as const, ...s } : { found: false as const }
    },
  })
