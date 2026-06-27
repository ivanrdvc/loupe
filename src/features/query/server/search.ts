import type { SpanSummary, TraceSummary } from '#/lib/telemetry'
import { listRecentSpans, listRecentTraces } from '#/lib/telemetry'
import { badRequest, json, pageMeta, parseSince, readPage } from '../logic/respond'

const WINDOW_CAP = 500

type Sort = 'recent' | 'cost' | 'tokens' | 'duration'
const SORTS: Sort[] = ['recent', 'cost', 'tokens', 'duration']

interface Filters {
  q?: string
  status?: 'error' | 'ok'
  agent?: string
  model?: string
  session?: string
  user?: string
  category?: string
  minCost?: number
  minTokens?: number
  minDurationMs?: number
}

const inc = (hay: string | undefined, needle?: string) => !needle || (hay ?? '').toLowerCase().includes(needle)
const num = (v: string | null): number | undefined => {
  const n = Number.parseFloat(v ?? '')
  return Number.isFinite(n) ? n : undefined
}

function readFilters(p: URLSearchParams): Filters {
  const status = p.get('status')
  return {
    q: p.get('q')?.toLowerCase() || undefined,
    status: status === 'error' || status === 'ok' ? status : undefined,
    agent: p.get('agent')?.toLowerCase() || undefined,
    model: p.get('model')?.toLowerCase() || undefined,
    session: p.get('session')?.toLowerCase() || undefined,
    user: p.get('user')?.toLowerCase() || undefined,
    category: p.get('category')?.toLowerCase() || undefined,
    minCost: num(p.get('min_cost')),
    minTokens: num(p.get('min_tokens')),
    minDurationMs: num(p.get('min_duration_ms')),
  }
}

const statusOf = (hasError?: boolean) => (hasError ? 'error' : 'ok')

function matchTrace(t: TraceSummary, f: Filters): boolean {
  return (
    (!f.status || statusOf(t.hasError) === f.status) &&
    inc(t.agent, f.agent) &&
    inc(t.sessionId, f.session) &&
    inc(`${t.userName ?? ''} ${t.userId ?? ''}`, f.user) &&
    (!f.category || t.category === f.category) &&
    (f.minCost == null || (t.totalCostUsd ?? 0) >= f.minCost) &&
    (f.minTokens == null || (t.totalTokens ?? 0) >= f.minTokens) &&
    (f.minDurationMs == null || t.durationMs >= f.minDurationMs) &&
    inc([t.agent, t.rootOperation, t.serviceName, t.sessionId, t.category, t.llmPurpose].join(' '), f.q)
  )
}

function matchSpan(s: SpanSummary, f: Filters): boolean {
  return (
    (!f.status || statusOf(s.hasError) === f.status) &&
    inc(s.label, f.agent) &&
    inc(s.modelId, f.model) &&
    inc(`${s.userName ?? ''} ${s.userId ?? ''}`, f.user) &&
    (f.minCost == null || (s.totalCostUsd ?? 0) >= f.minCost) &&
    (f.minTokens == null || (s.totalTokens ?? 0) >= f.minTokens) &&
    (f.minDurationMs == null || s.durationMs >= f.minDurationMs) &&
    inc([s.spanName, s.label, s.modelId, s.kind].join(' '), f.q)
  )
}

const sortKey =
  (sort: Sort) => (x: { startedAtMs: number; durationMs: number; totalTokens?: number; totalCostUsd?: number }) =>
    sort === 'cost'
      ? (x.totalCostUsd ?? 0)
      : sort === 'tokens'
        ? (x.totalTokens ?? 0)
        : sort === 'duration'
          ? x.durationMs
          : x.startedAtMs

const top = <T>(values: T[], n = 20): T[] => values.slice(0, n)
const tally = (values: (string | undefined)[]): string[] => {
  const counts = new Map<string, number>()
  for (const v of values) if (v) counts.set(v, (counts.get(v) ?? 0) + 1)
  return [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([k]) => k)
}

/**
 * The steered research primitive shared by `/api/search` and `/api/traces`:
 * fetch a bounded recent window, then filter / free-text / sort in-memory, and
 * page the hits (`limit`/`offset`) so a wide window never overflows the caller.
 * `forced` pins the entity (the `/api/traces` alias passes 'traces').
 */
export async function runSearch(p: URLSearchParams, forced?: 'traces' | 'spans'): Promise<Response> {
  const entity = forced ?? (p.get('entity') === 'spans' ? 'spans' : 'traces')
  const { limit, offset } = readPage(p, 20)
  const sort = (SORTS.includes(p.get('sort') as Sort) ? p.get('sort') : 'recent') as Sort
  const { fromUs, toUs, label } = parseSince(p.get('since'), 7)
  const f = readFilters(p)
  const key = sortKey(sort)

  if (entity === 'spans') {
    const r = await listRecentSpans({ limit: WINDOW_CAP, fromUs, toUs })
    if (!r) return badRequest('Active telemetry provider does not support listing spans')
    const hits = r.spans.filter((s) => matchSpan(s, f)).sort((a, b) => key(b) - key(a))
    return json({
      entity,
      provider: r.provider,
      // `capped`: the window hit WINDOW_CAP, so matches older than it weren't
      // scanned — `page.has_more=false` means "end of window", not "of all data".
      window: { since: label, scanned: r.spans.length, capped: r.spans.length >= WINDOW_CAP },
      page: pageMeta(hits.length, limit, offset),
      results: hits.slice(offset, offset + limit).map((s) => ({
        span_id: s.spanId,
        trace_id: s.traceId,
        name: s.spanName,
        kind: s.kind,
        label: s.label,
        started_at: new Date(s.startedAtMs).toISOString(),
        duration_ms: s.durationMs,
        status: statusOf(s.hasError),
        model: s.modelId,
        total_tokens: s.totalTokens,
        total_cost_usd: s.totalCostUsd,
      })),
      facets: { models: top(tally(r.spans.map((s) => s.modelId))), kinds: top(tally(r.spans.map((s) => s.kind))) },
    })
  }

  const r = await listRecentTraces({ limit: WINDOW_CAP, fromUs, toUs })
  if (!r) return badRequest('Active telemetry provider does not support listing traces')
  const hits = r.traces.filter((t) => matchTrace(t, f)).sort((a, b) => key(b) - key(a))
  return json({
    entity,
    provider: r.provider,
    window: { since: label, scanned: r.traces.length, capped: r.traces.length >= WINDOW_CAP },
    page: pageMeta(hits.length, limit, offset),
    results: hits.slice(offset, offset + limit).map((t) => ({
      id: t.id,
      started_at: new Date(t.startedAtMs).toISOString(),
      duration_ms: t.durationMs,
      status: statusOf(t.hasError),
      agent: t.agent,
      operation: t.rootOperation,
      category: t.category,
      span_count: t.spanCount,
      total_tokens: t.totalTokens,
      total_cost_usd: t.totalCostUsd,
      session_id: t.sessionId,
      user: t.userName ?? t.userId,
    })),
    facets: {
      agents: top(tally(r.traces.map((t) => t.agent))),
      categories: top(tally(r.traces.map((t) => t.category))),
      services: top(tally(r.traces.map((t) => t.serviceName))),
    },
  })
}
