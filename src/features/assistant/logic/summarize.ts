import type { Span } from '#/lib/spans'

const DAY_US = 24 * 60 * 60 * 1_000_000

export function lastNDaysWindow(days: number, nowMs: number) {
  const toUs = nowMs * 1000
  return { fromUs: toUs - days * DAY_US, toUs }
}

const MAX_STEPS = 80
const dur = (s: Span) => Math.round(s.endMs - s.startMs)

function uniq(xs: (string | undefined)[]): string[] {
  return [...new Set(xs.filter((x): x is string => Boolean(x)))]
}

/** Answer-shaped analysis of a span set — small, no heavy payloads
 *  (llmInput/llmOutput/toolResult are excluded; deep-link to inspect those). */
export function summarize(spans: Span[]) {
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
