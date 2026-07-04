import { keepPreviousData, queryOptions } from '@tanstack/react-query'
import { createServerFn } from '@tanstack/react-start'
import { ensureSession } from '#/lib/auth/guards'
import { queryKeys, STALE_LIVE_MS } from '#/lib/query-keys'
import { listRecentSpans, listRecentTraces, TRACE_CATEGORIES, type TraceCategory } from '#/lib/telemetry'
import { parseRangeUserInput, serialize, type TimeRange, windowUs } from '#/lib/time-range'

export const TRACES_PAGE_SIZE = 100

const CATEGORY_SET = new Set<TraceCategory>(TRACE_CATEGORIES)

export interface TraceListFilters {
  category?: string
  status?: string
  search?: string
}
export interface SpanListFilters {
  kind?: string
  status?: string
  search?: string
}

const str = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : undefined)
const asStatus = (v: unknown) => (v === 'error' || v === 'ok' ? v : undefined)
const asCategory = (v: unknown) =>
  typeof v === 'string' && CATEGORY_SET.has(v as TraceCategory) ? (v as TraceCategory) : undefined
const asKind = (v: unknown) => (v === 'utility' || v === 'sub-agent' ? (v as 'utility' | 'sub-agent') : undefined)

const parseTracesInput = (input: unknown) => {
  const raw = (input ?? {}) as Record<string, unknown>
  const page = Math.max(0, Math.floor(Number(raw.page) || 0))
  return { ...parseRangeUserInput(raw), page, category: raw.category, status: raw.status, search: raw.search }
}

const parseSpansInput = (input: unknown) => {
  const raw = (input ?? {}) as Record<string, unknown>
  const page = Math.max(0, Math.floor(Number(raw.page) || 0))
  return { ...parseRangeUserInput(raw), page, kind: raw.kind, status: raw.status, search: raw.search }
}

const fetchTraces = createServerFn({ method: 'GET' })
  .inputValidator(parseTracesInput)
  .handler(async ({ data }) => {
    await ensureSession()
    return await listRecentTraces({
      limit: TRACES_PAGE_SIZE,
      offset: data.page * TRACES_PAGE_SIZE,
      ...windowUs(data.range),
      ...(data.userId ? { userId: data.userId } : {}),
      ...(asCategory(data.category) ? { category: asCategory(data.category) } : {}),
      ...(asStatus(data.status) ? { status: asStatus(data.status) } : {}),
      ...(str(data.search) ? { search: str(data.search) } : {}),
    })
  })

const fetchSpans = createServerFn({ method: 'GET' })
  .inputValidator(parseSpansInput)
  .handler(async ({ data }) => {
    await ensureSession()
    return await listRecentSpans({
      limit: TRACES_PAGE_SIZE,
      offset: data.page * TRACES_PAGE_SIZE,
      ...windowUs(data.range),
      ...(data.userId ? { userId: data.userId } : {}),
      ...(asKind(data.kind) ? { kind: asKind(data.kind) } : {}),
      ...(asStatus(data.status) ? { status: asStatus(data.status) } : {}),
      ...(str(data.search) ? { search: str(data.search) } : {}),
    })
  })

const traceFilterKey = (f: TraceListFilters) => ({ c: f.category ?? '', s: f.status ?? '', q: f.search ?? '' })
const spanFilterKey = (f: SpanListFilters) => ({ k: f.kind ?? '', s: f.status ?? '', q: f.search ?? '' })

export const tracesQuery = (range: TimeRange, userId = '', page = 0, filters: TraceListFilters = {}) =>
  queryOptions({
    queryKey: [...queryKeys.traces.window(serialize(range), userId), page, traceFilterKey(filters)] as const,
    queryFn: () => fetchTraces({ data: { range, userId, page, ...filters } }),
    staleTime: STALE_LIVE_MS,
    placeholderData: keepPreviousData,
  })

export const spansQuery = (range: TimeRange, userId = '', page = 0, filters: SpanListFilters = {}) =>
  queryOptions({
    queryKey: [...queryKeys.spans.window(serialize(range), userId), page, spanFilterKey(filters)] as const,
    queryFn: () => fetchSpans({ data: { range, userId, page, ...filters } }),
    staleTime: STALE_LIVE_MS,
    placeholderData: keepPreviousData,
  })
