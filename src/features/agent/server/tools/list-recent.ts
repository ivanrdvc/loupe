import { tool } from 'ai'
import { z } from 'zod'
import { listRecentSessions, listRecentTraces } from '#/lib/telemetry'
import { window } from './shared'

/**
 * Compact rows of recent end-to-end traces for triage.
 */
export const listRecentTracesTool = () =>
  tool({
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
  })

/**
 * Compact rows of recent sessions for triage.
 */
export const listRecentSessionsTool = () =>
  tool({
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
  })
