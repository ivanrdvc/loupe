import { tool } from 'ai'
import { z } from 'zod'
import { listSessionLogs } from '#/lib/telemetry'
import { window } from './shared'

/**
 * Fetch application logs correlated to a trace by trace_id.
 */
export const getLogsTool = () =>
  tool({
    description:
      'Fetch application logs correlated to a trace by trace_id — level, message, and the span each came from, in order. Use to see what the app itself logged around a failure, beyond what the spans expose (e.g. the line before an exception). Returns found:false when the agent emits no trace-linked logs.',
    inputSchema: z.object({
      traceId: z.string().describe('The trace id to fetch correlated logs for.'),
      days: z.number().optional().describe('Look-back window in days. Default 30.'),
    }),
    execute: async ({ traceId, days }) => {
      const res = await listSessionLogs({ traceIds: [traceId], limit: 100, ...window(days ?? 30) })
      const logs = (res?.logs ?? []).map((l) => ({
        level: l.level,
        message: l.message.length > 300 ? `${l.message.slice(0, 300)}…` : l.message,
        spanId: l.spanId,
      }))
      return { found: logs.length > 0, count: logs.length, logs }
    },
  })
