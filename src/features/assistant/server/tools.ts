import { tool } from 'ai'
import { z } from 'zod'
import { getSession, getTrace, listRecentSessions, listRecentTraces, listTools } from '#/lib/telemetry'
import { lastNDaysWindow, summarize } from '../logic/summarize'

const window = (days: number | undefined) => lastNDaysWindow(days ?? 7, Date.now())

export const assistantTools = {
  get_trace: tool({
    description:
      'Summarize one trace (end-to-end run) by id: duration, tokens, cost, errors, slowest steps, tools used, and the ordered step path. Use for "explain this trace" or "what was slow / what failed". Returns metadata only — point the user at the link for raw messages and tool I/O.',
    inputSchema: z.object({ traceId: z.string().describe('The trace id.') }),
    execute: async ({ traceId }) => {
      const res = await getTrace(traceId)
      if (!res?.spans.length) return { found: false as const }
      return { found: true as const, link: `?trace=${traceId}`, truncated: res.truncated, ...summarize(res.spans) }
    },
  }),

  get_session: tool({
    description:
      'Summarize a session (conversation / multi-trace run) by id: title, trace count, duration, tokens, errors, agents, and slowest steps. Use for "what happened this session", "any errors", or "where did the tokens go".',
    inputSchema: z.object({ sessionId: z.string().describe('The session id.') }),
    execute: async ({ sessionId }) => {
      const res = await getSession(sessionId)
      if (!res?.spans.length) return { found: false as const }
      return {
        found: true as const,
        link: `?session=${sessionId}`,
        title: res.title,
        traceCount: res.traceIds.length,
        ...summarize(res.spans),
      }
    },
  }),

  list_recent_traces: tool({
    description:
      'List recent end-to-end traces (most recent runs) in a time window, with agent, duration, tokens, cost, and error flags.',
    inputSchema: z.object({ days: z.number().optional().describe('Look-back window in days. Default 7.') }),
    execute: async ({ days }) => {
      const res = await listRecentTraces({ limit: 50, ...window(days) })
      return { provider: res?.provider, traces: res?.traces ?? [] }
    },
  }),

  list_recent_sessions: tool({
    description:
      'List recent sessions (conversations / multi-turn runs) in a time window, with title, user, duration, tokens, and error flags.',
    inputSchema: z.object({ days: z.number().optional().describe('Look-back window in days. Default 7.') }),
    execute: async ({ days }) => {
      const res = await listRecentSessions({ limit: 50, ...window(days) })
      return { provider: res?.provider, sessions: res?.sessions ?? [] }
    },
  }),

  list_tools: tool({
    description:
      'List the tool catalog — every tool the agents call, with call counts, error rate, and token-size percentiles (p50/p95/max). Use to find heavy or failing tools.',
    inputSchema: z.object({ days: z.number().optional().describe('Look-back window in days. Default 7.') }),
    execute: async ({ days }) => {
      const rows = await listTools({ limit: 200, ...window(days) })
      return { tools: rows }
    },
  }),
}
