import type { ListSort, ListSpansOpts, ListTracesOpts, TraceCategory } from '#/lib/telemetry'
import { listRecentSpans, listRecentTraces, TRACE_CATEGORIES } from '#/lib/telemetry'
import { badRequest, json, parseSince, readPage } from '../logic/respond'

const SORTS: readonly ListSort[] = ['recent', 'cost', 'tokens', 'duration']

const num = (v: string | null): number | undefined => {
  const n = Number.parseFloat(v ?? '')
  return Number.isFinite(n) ? n : undefined
}

const str = (v: string | null): string | undefined => v?.trim() || undefined

// URL params → provider filter opts (server-side WHERE). Shared prefix; the
// per-entity builders below add the fields their SELECT supports. Sort + paging
// are applied at the call site (ORDER BY / LIMIT / OFFSET in the provider).
function readNumericFloors(p: URLSearchParams): Pick<ListTracesOpts, 'minCostUsd' | 'minTokens' | 'minDurationMs'> {
  return {
    minCostUsd: num(p.get('min_cost')),
    minTokens: num(p.get('min_tokens')),
    minDurationMs: num(p.get('min_duration_ms')),
  }
}

function readStatus(p: URLSearchParams): 'error' | 'ok' | undefined {
  const status = p.get('status')
  return status === 'error' || status === 'ok' ? status : undefined
}

function readTraceOpts(p: URLSearchParams): ListTracesOpts {
  const category = str(p.get('category'))?.toLowerCase() as TraceCategory | undefined
  return {
    status: readStatus(p),
    search: str(p.get('q')),
    agentContains: str(p.get('agent')),
    userContains: str(p.get('user')),
    sessionContains: str(p.get('session')),
    ...(category && TRACE_CATEGORIES.includes(category) ? { category } : {}),
    ...readNumericFloors(p),
  }
}

function readSpanOpts(p: URLSearchParams): ListSpansOpts {
  return {
    status: readStatus(p),
    search: str(p.get('q')),
    agentContains: str(p.get('agent')),
    modelContains: str(p.get('model')),
    userContains: str(p.get('user')),
    ...readNumericFloors(p),
  }
}

const statusOf = (hasError?: boolean) => (hasError ? 'error' : 'ok')

const top = <T>(values: T[], n = 20): T[] => values.slice(0, n)
const tally = (values: (string | undefined)[]): string[] => {
  const counts = new Map<string, number>()
  for (const v of values) if (v) counts.set(v, (counts.get(v) ?? 0) + 1)
  return [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([k]) => k)
}

/**
 * The steered research primitive shared by `/api/search` and `/api/traces`:
 * filter / sort / page entirely in the provider (WHERE + ORDER BY + LIMIT/OFFSET)
 * and return exactly the requested page. `has_more` comes from the provider, not
 * a scanned-window cap. `facets` reflect the returned page. `forced` pins the
 * entity (the `/api/traces` alias passes 'traces').
 */
export async function runSearch(p: URLSearchParams, forced?: 'traces' | 'spans'): Promise<Response> {
  const entity = forced ?? (p.get('entity') === 'spans' ? 'spans' : 'traces')
  const { limit, offset } = readPage(p, 20)
  const sortBy = (SORTS.includes(p.get('sort') as ListSort) ? p.get('sort') : 'recent') as ListSort
  const { fromUs, toUs, label } = parseSince(p.get('since'), 7)

  if (entity === 'spans') {
    const r = await listRecentSpans({ ...readSpanOpts(p), sortBy, limit, offset, fromUs, toUs })
    if (!r) return badRequest('Active telemetry provider does not support listing spans')
    return json({
      entity,
      provider: r.provider,
      window: { since: label },
      page: { limit, offset, has_more: r.hasMore },
      results: r.spans.map((s) => ({
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

  const r = await listRecentTraces({ ...readTraceOpts(p), sortBy, limit, offset, fromUs, toUs })
  if (!r) return badRequest('Active telemetry provider does not support listing traces')
  return json({
    entity,
    provider: r.provider,
    window: { since: label },
    page: { limit, offset, has_more: r.hasMore },
    results: r.traces.map((t) => ({
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
