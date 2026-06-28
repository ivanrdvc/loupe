import { tool } from 'ai'
import { z } from 'zod'
import { listTools } from '#/lib/telemetry'
import { window } from './shared'

/**
 * List the tool catalog of the user's observed agents, with call/error/size stats.
 */
export const listObservedAgentToolsTool = () =>
  tool({
    description:
      "List the tool catalog of the user's observed agents — every tool those agents call, with call counts, error rate, and token-size percentiles (p50/p95/max). Use to find heavy or failing tools in their agents.",
    inputSchema: z.object({ days: z.number().optional().describe('Look-back window in days. Default 7.') }),
    execute: async ({ days }) => {
      const rows = await listTools({ limit: 100, ...window(days) })
      return { tools: rows }
    },
  })
