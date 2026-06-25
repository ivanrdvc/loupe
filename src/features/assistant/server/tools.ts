import { tool } from 'ai'
import { z } from 'zod'
import type { Span } from '#/lib/spans'
import { getSession, getTrace, listRecentSessions, listRecentTraces, listTools } from '#/lib/telemetry'

const DAY_US = 24 * 60 * 60 * 1_000_000

function lastNDaysWindow(days: number) {
  const toUs = Date.now() * 1000
  return { fromUs: toUs - days * DAY_US, toUs }
}

const MAX_STEPS = 80

function uniq(xs: (string | undefined)[]): string[] {
  return [...new Set(xs.filter(Boolean) as string[])]
}

const dur = (s: Span) => Math.round(s.endMs - s.startMs)

/** Server-side analysis of a span set — small, answer-shaped, no heavy payloads
 *  (llmInput/llmOutput/toolResult are excluded; deep-link to inspect those). */
function summarize(spans: Span[]) {
  const start = Math.min(...spans.map((s) => s.startMs))
  const end = Math.max(...spans.map((s) => s.endMs))
  const errored = spans.filter((s) => s.hasError || s.errorMessage)
  const toolCounts: Record<string, number> = {}
  for (const s of spans) if (s.toolName) toolCounts[s.toolName] = (toolCounts[s.toolName] ?? 0) + 1

  return {
    durationMs: Math.round(end - start),
    spanCount: spans.length,
    totalTokens: spans.reduce((n, s) => n + (s.tokens ?? 0), 0) || undefined,
    totalCostUsd: spans.reduce((n, s) => n + (s.costUsd ?? 0), 0) || undefined,
    errorCount: errored.length,
    agents: uniq(spans.map((s) => s.agentName)),
    models: uniq(spans.map((s) => s.model)),
    tools: Object.entries(toolCounts).map(([name, calls]) => ({ name, calls })),
    slowest: [...spans]
      .sort((a, b) => dur(b) - dur(a))
      .slice(0, 3)
      .map((s) => ({ name: s.name, op: s.operation, tool: s.toolName, durationMs: dur(s) })),
    errors: errored.slice(0, 10).map((s) => ({ name: s.name, tool: s.toolName, message: s.errorMessage })),
    // Ordered step path for narration — metadata only.
    steps: [...spans]
      .sort((a, b) => a.startMs - b.startMs)
      .slice(0, MAX_STEPS)
      .map((s) => ({
        op: s.operation,
        name: s.name,
        tool: s.toolName,
        agent: s.agentName,
        purpose: s.operationName,
        durationMs: dur(s),
        error: s.errorMessage ?? (s.hasError ? true : undefined),
      })),
    stepsTruncated: spans.length > MAX_STEPS,
  }
}

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
