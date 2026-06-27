import { tool } from 'ai'
import { z } from 'zod'
import {
  getSession,
  getToolPayloadBody,
  getTrace,
  listRecentSessions,
  listRecentTraces,
  listSessionLogs,
  listTools,
} from '#/lib/telemetry'
import { lastNDaysWindow, summarize } from '../logic/summarize'
import type { MentionRef, ResolvedMention } from './prompt'

const window = (days: number | undefined) => lastNDaysWindow(days ?? 7, Date.now())

async function traceSummary(traceId: string) {
  const res = await getTrace(traceId)
  if (!res?.spans.length) return null
  return { link: `?trace=${traceId}`, truncated: res.truncated, ...summarize(res.spans) }
}

async function sessionSummary(sessionId: string) {
  const res = await getSession(sessionId)
  if (!res?.spans.length) return null
  return { link: `?session=${sessionId}`, title: res.title, traceCount: res.traceIds.length, ...summarize(res.spans) }
}

/** Eagerly resolve @-mentioned runs to the same summaries the tools return, so
 *  the agent has them in context without a tool round-trip. */
export async function resolveMentions(mentions: MentionRef[]): Promise<ResolvedMention[]> {
  return Promise.all(
    mentions.map(async (m) => ({
      ...m,
      summary: m.kind === 'trace' ? await traceSummary(m.id) : await sessionSummary(m.id),
    })),
  )
}

export const agentTools = {
  get_trace: tool({
    description:
      'Summarize one trace (end-to-end run) by id: duration, tokens, cost, errors (with exception type + trimmed stack), slowest steps, tools used, and the ordered step path. Use for "explain this trace", "what was slow", or "why did it fail". Returns metadata only — point the user at the link for raw messages and tool I/O.',
    inputSchema: z.object({ traceId: z.string().describe('The trace id.') }),
    execute: async ({ traceId }) => {
      const s = await traceSummary(traceId)
      return s ? { found: true as const, ...s } : { found: false as const }
    },
  }),

  get_session: tool({
    description:
      'Summarize a session (conversation / multi-trace run) by id: title, trace count, duration, tokens, errors, agents, and slowest steps. Use for "what happened this session", "any errors", or "where did the tokens go".',
    inputSchema: z.object({ sessionId: z.string().describe('The session id.') }),
    execute: async ({ sessionId }) => {
      const s = await sessionSummary(sessionId)
      return s ? { found: true as const, ...s } : { found: false as const }
    },
  }),

  list_recent_traces: tool({
    description:
      'List recent end-to-end traces (most recent runs) in a time window — compact rows for triage: id, agent, start, duration, tokens, cost, error flag. Call get_trace for detail on one.',
    inputSchema: z.object({ days: z.number().optional().describe('Look-back window in days. Default 7.') }),
    execute: async ({ days }) => {
      const res = await listRecentTraces({ limit: 20, ...window(days) })
      const traces = (res?.traces ?? []).map((t) => ({
        id: t.id,
        agent: t.agent,
        startedAtMs: t.startedAtMs,
        durationMs: t.durationMs,
        totalTokens: t.totalTokens,
        totalCostUsd: t.totalCostUsd,
        hasError: t.hasError,
      }))
      return { provider: res?.provider, traces }
    },
  }),

  list_recent_sessions: tool({
    description:
      'List recent sessions (conversations / multi-turn runs) in a time window — compact rows: id, title, agents, trace count, active duration, tokens, cost, error flag. Call get_session for detail on one.',
    inputSchema: z.object({ days: z.number().optional().describe('Look-back window in days. Default 7.') }),
    execute: async ({ days }) => {
      const res = await listRecentSessions({ limit: 20, ...window(days) })
      const sessions = (res?.sessions ?? []).map((s) => ({
        sessionId: s.sessionId,
        title: s.title,
        agents: s.agents,
        traceCount: s.traceCount,
        activeDurationMs: s.activeDurationMs,
        totalTokens: s.totalTokens,
        totalCostUsd: s.totalCostUsd,
        hasError: s.hasError,
      }))
      return { provider: res?.provider, sessions }
    },
  }),

  get_tool_result: tool({
    description:
      'Fetch the actual result a single tool call returned, by its span id (the "id" on a tool step or error from get_trace/get_session). Use to see what a tool really produced — especially the payload behind a failing tool step. Returns found:false if the span has no captured result.',
    inputSchema: z.object({ spanId: z.string().describe('The tool span id, from a step or error entry.') }),
    execute: async ({ spanId }) => {
      const res = await getToolPayloadBody(spanId)
      if (!res) return { found: false as const }
      return { found: true as const, tokens: res.tokens, truncated: res.truncated, body: res.body }
    },
  }),

  get_logs: tool({
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
  }),

  list_observed_agent_tools: tool({
    description:
      "List the tool catalog of the user's observed agents — every tool those agents call, with call counts, error rate, and token-size percentiles (p50/p95/max). Use to find heavy or failing tools in their agents.",
    inputSchema: z.object({ days: z.number().optional().describe('Look-back window in days. Default 7.') }),
    execute: async ({ days }) => {
      const rows = await listTools({ limit: 100, ...window(days) })
      return { tools: rows }
    },
  }),
}
