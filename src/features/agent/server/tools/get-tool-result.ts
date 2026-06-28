import { tool } from 'ai'
import { z } from 'zod'
import { getToolPayloadBody } from '#/lib/telemetry'

/**
 * Fetch the actual result a single tool call returned, by its span id.
 */
export const getToolResultTool = () =>
  tool({
    description:
      'Fetch the actual result a single tool call returned, by its span id (the "id" on a tool step or error from get_trace/get_session). Use to see what a tool really produced — especially the payload behind a failing tool step. Returns found:false if the span has no captured result.',
    inputSchema: z.object({ spanId: z.string().describe('The tool span id, from a step or error entry.') }),
    execute: async ({ spanId }) => {
      const res = await getToolPayloadBody(spanId)
      if (!res) return { found: false as const }
      return { found: true as const, tokens: res.tokens, truncated: res.truncated, body: res.body }
    },
  })
