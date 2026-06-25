import { tool } from 'ai'
import { z } from 'zod'
import type { Span } from '#/lib/spans'
import { getSession, getTrace, listRecentSessions, listRecentTraces, listTools } from '#/lib/telemetry'

const DAY_US = 24 * 60 * 60 * 1_000_000

function lastNDaysWindow(days: number) {
  const toUs = Date.now() * 1000
  return { fromUs: toUs - days * DAY_US, toUs }
}

/** Trim a full Span to the fields the model needs — keeps tool output small. */
function compactSpan(s: Span) {
  return {
    id: s.id,
    kind: s.kind,
    operation: s.operation,
    name: s.name,
    purpose: s.operationName,
    agent: s.agentName,
    tool: s.toolName,
    model: s.model,
    durationMs: Math.round(s.endMs - s.startMs),
    tokens: s.tokens,
    costUsd: s.costUsd,
    hasError: s.hasError || undefined,
    error: s.errorMessage,
  }
}

const MAX_SPANS = 120

export const assistantTools = {
  get_trace: tool({
    description:
      'Fetch the spans of a single trace (end-to-end run) by id. Use for "explain this trace" or to inspect what an agent did, which tools it called, errors, and token usage.',
    inputSchema: z.object({ traceId: z.string().describe('The trace id to fetch.') }),
    execute: async ({ traceId }) => {
      const res = await getTrace(traceId)
      if (!res) return { found: false as const }
      return {
        found: true as const,
        provider: res.provider,
        truncated: res.truncated,
        spanCount: res.spans.length,
        spans: res.spans.slice(0, MAX_SPANS).map(compactSpan),
      }
    },
  }),

  get_session: tool({
    description:
      'Fetch a session by id — its spans across all traces in the session, plus title and trace ids. Use for "what happened in this session" or "was the user satisfied".',
    inputSchema: z.object({ sessionId: z.string().describe('The session id to fetch.') }),
    execute: async ({ sessionId }) => {
      const res = await getSession(sessionId)
      if (!res) return { found: false as const }
      return {
        found: true as const,
        provider: res.provider,
        title: res.title,
        traceIds: res.traceIds,
        spanCount: res.spans.length,
        spans: res.spans.slice(0, MAX_SPANS).map(compactSpan),
      }
    },
  }),

  list_recent_traces: tool({
    description:
      'List recent end-to-end traces (most recent runs) in a time window, with agent, duration, tokens, cost, and error flags.',
    inputSchema: z.object({
      days: z.number().optional().describe('Look-back window in days. Default 7.'),
    }),
    execute: async ({ days }) => {
      const res = await listRecentTraces({ limit: 50, ...lastNDaysWindow(days ?? 7) })
      return { provider: res?.provider, traces: res?.traces ?? [] }
    },
  }),

  list_recent_sessions: tool({
    description:
      'List recent sessions (conversations / multi-turn runs) in a time window, with title, user, duration, tokens, and error flags.',
    inputSchema: z.object({
      days: z.number().optional().describe('Look-back window in days. Default 7.'),
    }),
    execute: async ({ days }) => {
      const res = await listRecentSessions({ limit: 50, ...lastNDaysWindow(days ?? 7) })
      return { provider: res?.provider, sessions: res?.sessions ?? [] }
    },
  }),

  list_tools: tool({
    description:
      'List the tool catalog — every tool the agents call, with call counts, error rate, and token-size percentiles (p50/p95/max). Use to find heavy or failing tools.',
    inputSchema: z.object({
      days: z.number().optional().describe('Look-back window in days. Default 7.'),
    }),
    execute: async ({ days }) => {
      const rows = await listTools({ limit: 200, ...lastNDaysWindow(days ?? 7) })
      return { tools: rows }
    },
  }),
}
