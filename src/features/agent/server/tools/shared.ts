import { z } from 'zod'
import {
  type CapturedExample,
  exampleFromTrace,
  examplesFromSession,
} from '#/features/evaluation/server/dataset-capture'
import { getSession, getTrace } from '#/lib/telemetry'
import type { MentionRef, ResolvedMention } from '../../logic/request'
import { lastNDaysWindow, summarize } from '../../logic/summarize'

/**
 * Look-back window for the list/log tools; defaults to 7 days.
 */
export const window = (days: number | undefined) => lastNDaysWindow(days ?? 7, Date.now())

/**
 * Finished markdown links with origin + the right param baked in, so the model drops them in as-is.
 */
export const traceLink = (traceId: string, origin?: string) => `[open trace](${origin ?? ''}?trace=${traceId})`
export const sessionLink = (sessionId: string, origin?: string) =>
  `[open session](${origin ?? ''}?session=${sessionId})`

/**
 * Headline by default; `detail` (slowest, steps, tokens, cost) is withheld unless
 * asked — what the model never receives, it can't recite.
 */
export async function traceSummary(traceId: string, origin?: string, detail = false) {
  const res = await getTrace(traceId)
  if (!res?.spans.length) return null
  const { detail: d, ...head } = summarize(res.spans)
  return { link: traceLink(traceId, origin), truncated: res.truncated, ...head, ...(detail ? { detail: d } : {}) }
}

export async function sessionSummary(sessionId: string, origin?: string, detail = false) {
  const res = await getSession(sessionId)
  if (!res?.spans.length) return null
  const { detail: d, ...head } = summarize(res.spans)
  return {
    link: sessionLink(sessionId, origin),
    title: res.title,
    traceCount: res.traceIds.length,
    ...head,
    ...(detail ? { detail: d } : {}),
  }
}

/**
 * Eagerly resolve @-mentioned runs to the same summaries the tools return, so the
 * agent has them in context without a tool round-trip.
 */
export async function resolveMentions(mentions: MentionRef[], origin?: string): Promise<ResolvedMention[]> {
  return Promise.all(
    mentions.map(async (m) => ({
      ...m,
      summary: m.kind === 'trace' ? await traceSummary(m.id, origin) : await sessionSummary(m.id, origin),
    })),
  )
}

export const exampleEntrySchema = z.object({
  traceId: z.string().optional().describe('A trace to capture one example from.'),
  sessionId: z.string().optional().describe('A session to expand into one example per trace in it.'),
  spanId: z.string().optional().describe('Specific span; omit to pick the last chat span with output.'),
  expected: z.string().optional().describe('Golden answer; omit to use the observed output as a draft baseline.'),
  metadata: z
    .record(z.string(), z.string())
    .optional()
    .describe('Optional labels for the example, e.g. {model, errored}.'),
})
export type ExampleEntry = z.infer<typeof exampleEntrySchema>
export type ResolvedExample = { cap: CapturedExample; expected: string | null; metadata?: Record<string, string> }

/**
 * Flatten example entries into concrete captures: a sessionId fans out to one per
 * trace (each keeps its own observed output as the baseline); a traceId is a single capture.
 */
export async function captureAll(entries: ExampleEntry[]): Promise<ResolvedExample[]> {
  const out: ResolvedExample[] = []
  for (const e of entries) {
    if (e.sessionId) {
      for (const cap of await examplesFromSession(e.sessionId)) {
        out.push({ cap, expected: cap.defaultExpected, metadata: e.metadata })
      }
    } else if (e.traceId) {
      const cap = await exampleFromTrace(e.traceId, e.spanId)
      if (cap) out.push({ cap, expected: e.expected ?? cap.defaultExpected, metadata: e.metadata })
    }
  }
  return out
}

export function deriveMeta(
  resolved: ResolvedExample[],
  given: { name?: string; description?: string; tags?: string[] },
) {
  const agent = [...new Set(resolved.map((r) => r.cap.sourceAgent).filter((a): a is string => Boolean(a)))][0]
  const n = resolved.length
  return {
    name: given.name ?? (agent ? `${agent} regression` : 'regression dataset'),
    tags: given.tags ?? [...(agent ? [agent] : []), 'regression'],
    description:
      given.description ??
      `Regression baseline from ${n} run${n === 1 ? '' : 's'}${agent ? ` of ${agent}` : ''}. Expected values are observed outputs — review before trusting.`,
  }
}
