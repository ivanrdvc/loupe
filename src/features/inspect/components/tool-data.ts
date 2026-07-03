import { keepPreviousData, queryOptions } from '@tanstack/react-query'
import { createServerFn } from '@tanstack/react-start'
import { ensureSession } from '#/lib/auth/guards'
import { queryKeys, STALE_TELEMETRY_MS } from '#/lib/query-keys'
import {
  getToolPayloadBody,
  listToolPayloadOverTime,
  listToolRecentCalls,
  listTools,
  type ToolDimensionFilter,
  type ToolPayloadBody,
  type ToolPayloadPoint,
  type ToolRow,
  type ToolSortColumn,
} from '#/lib/telemetry'
import { isToolDimensionField } from '#/lib/telemetry/conventions'
import { DEFAULT, parse, serialize, type TimeRange, windowUs } from '#/lib/time-range'

// Queried live: React Query's staleTime is the only cache, so the window and
// dimensions in the key can't disagree the way the old per-name LRU caches did.

function parseDimensions(input: unknown): ToolDimensionFilter[] {
  if (!Array.isArray(input)) return []
  const out: ToolDimensionFilter[] = []
  for (const d of input) {
    if (!d || typeof d !== 'object') continue
    const { field, value } = d as { field?: unknown; value?: unknown }
    if (typeof field === 'string' && isToolDimensionField(field) && typeof value === 'string' && value) {
      out.push({ field, value })
    }
  }
  return out
}

export type ToolSort = { by: ToolSortColumn; dir: 'asc' | 'desc' }

const TOOL_SORT_COLUMNS = new Set<ToolSortColumn>([
  'name',
  'calls',
  'errorRate',
  'p95Ms',
  'avgTokensEst',
  'p95TokensEst',
  'maxTokens',
  'totalTokensEst',
  'lastSeenMs',
])

function parseSort(input: unknown): ToolSort | undefined {
  if (!input || typeof input !== 'object') return undefined
  const { by, dir } = input as { by?: unknown; dir?: unknown }
  if (typeof by !== 'string' || !TOOL_SORT_COLUMNS.has(by as ToolSortColumn)) return undefined
  return { by: by as ToolSortColumn, dir: dir === 'asc' ? 'asc' : 'desc' }
}

const parseToolsInput = (input: unknown): { range: TimeRange; dimensions: ToolDimensionFilter[]; sort?: ToolSort } => {
  const obj = (input && typeof input === 'object' ? input : {}) as Record<string, unknown>
  return { range: parse(obj.range), dimensions: parseDimensions(obj.dimensions), sort: parseSort(obj.sort) }
}

export const TOOLS_PAGE_SIZE = 50

const parseToolsPageInput = (
  input: unknown,
): { range: TimeRange; dimensions: ToolDimensionFilter[]; sort?: ToolSort; page: number } => {
  const obj = (input && typeof input === 'object' ? input : {}) as Record<string, unknown>
  return {
    range: parse(obj.range),
    dimensions: parseDimensions(obj.dimensions),
    sort: parseSort(obj.sort),
    page: Math.max(0, Math.floor(Number(obj.page) || 0)),
  }
}

const parseToolInput = (input: unknown): { name: string; range: TimeRange } => {
  const obj = (input && typeof input === 'object' ? input : {}) as Record<string, unknown>
  if (typeof obj.name !== 'string' || !obj.name) throw new Error('expected tool name')
  return { name: obj.name, range: parse(obj.range) }
}

const spanIdValidator = (input: unknown): string => {
  if (typeof input !== 'string' || !input) throw new Error('expected span id')
  return input
}

const fetchCatalog = createServerFn({ method: 'GET' })
  .inputValidator(parseToolsInput)
  .handler(async ({ data }): Promise<ToolRow[]> => {
    await ensureSession()
    const { fromUs, toUs } = windowUs(data.range)
    return listTools({
      fromUs,
      toUs,
      limit: 1000,
      dimensions: data.dimensions,
      ...(data.sort ? { sortBy: data.sort.by, sortDir: data.sort.dir } : {}),
    })
  })

// The /tools catalog is server-paged: fetch one past the page so hasMore is
// exact, and let the ORDER BY (sort pushdown) do the ranking — a header click
// refetches one page of aggregates, not the whole catalog.
const fetchToolsPage = createServerFn({ method: 'GET' })
  .inputValidator(parseToolsPageInput)
  .handler(async ({ data }): Promise<{ rows: ToolRow[]; hasMore: boolean }> => {
    await ensureSession()
    const { fromUs, toUs } = windowUs(data.range)
    const rows = await listTools({
      fromUs,
      toUs,
      limit: TOOLS_PAGE_SIZE + 1,
      offset: data.page * TOOLS_PAGE_SIZE,
      dimensions: data.dimensions,
      ...(data.sort ? { sortBy: data.sort.by, sortDir: data.sort.dir } : {}),
    })
    return { rows: rows.slice(0, TOOLS_PAGE_SIZE), hasMore: rows.length > TOOLS_PAGE_SIZE }
  })

const fetchTool = createServerFn({ method: 'GET' })
  .inputValidator(parseToolInput)
  .handler(async ({ data }): Promise<ToolRow | null> => {
    await ensureSession()
    const { fromUs, toUs } = windowUs(data.range)
    const rows = await listTools({ fromUs, toUs, name: data.name })
    return rows[0] ?? null
  })

const fetchRecent = createServerFn({ method: 'GET' })
  .inputValidator(parseToolInput)
  .handler(async ({ data }) => {
    await ensureSession()
    const { fromUs, toUs } = windowUs(data.range)
    return listToolRecentCalls(data.name, { fromUs, toUs, limit: 8 })
  })

const fetchTrend = createServerFn({ method: 'GET' })
  .inputValidator(parseToolInput)
  .handler(async ({ data }): Promise<ToolPayloadPoint[]> => {
    await ensureSession()
    const { fromUs, toUs } = windowUs(data.range)
    return listToolPayloadOverTime(data.name, { fromUs, toUs })
  })

const fetchBody = createServerFn({ method: 'GET' })
  .inputValidator(spanIdValidator)
  .handler(async ({ data }): Promise<ToolPayloadBody | null> => {
    await ensureSession()
    return getToolPayloadBody(data)
  })

// The full per-tool aggregate set. Shared by the /tools catalog and the
// inspector's health hint — same numbers, one cached query.
export const toolsCatalogQuery = (
  range: TimeRange = DEFAULT,
  dimensions: ToolDimensionFilter[] = [],
  sort?: ToolSort,
) =>
  queryOptions({
    queryKey: queryKeys.tools.catalog(
      serialize(range),
      dimensions.length ? JSON.stringify(dimensions) : undefined,
      sort ? `${sort.by}:${sort.dir}` : undefined,
    ),
    queryFn: () => fetchCatalog({ data: { range, dimensions, sort } }),
    staleTime: STALE_TELEMETRY_MS,
  })

// One server page of the catalog for the /tools table. The full-set
// toolsCatalogQuery above stays for the home + inspector health hint (and CSV).
export const toolsPageQuery = (
  range: TimeRange = DEFAULT,
  dimensions: ToolDimensionFilter[] = [],
  sort?: ToolSort,
  page = 0,
) =>
  queryOptions({
    queryKey: queryKeys.tools.page(
      serialize(range),
      dimensions.length ? JSON.stringify(dimensions) : undefined,
      sort ? `${sort.by}:${sort.dir}` : undefined,
      page,
    ),
    queryFn: () => fetchToolsPage({ data: { range, dimensions, sort, page } }),
    staleTime: STALE_TELEMETRY_MS,
    placeholderData: keepPreviousData,
  })

export const toolDetailQuery = (name: string, range: TimeRange = DEFAULT) =>
  queryOptions({
    queryKey: queryKeys.tools.detail(name, serialize(range)),
    queryFn: () => fetchTool({ data: { name, range } }),
    staleTime: STALE_TELEMETRY_MS,
  })

export const toolRecentCallsQuery = (name: string, range: TimeRange = DEFAULT) =>
  queryOptions({
    queryKey: queryKeys.tools.recent(name, serialize(range)),
    queryFn: () => fetchRecent({ data: { name, range } }),
    staleTime: STALE_TELEMETRY_MS,
  })

export const toolPayloadTrendQuery = (name: string, range: TimeRange = DEFAULT) =>
  queryOptions({
    queryKey: queryKeys.tools.trend(name, serialize(range)),
    queryFn: () => fetchTrend({ data: { name, range } }),
    staleTime: STALE_TELEMETRY_MS,
  })

export const toolPayloadBodyQuery = (spanId: string) =>
  queryOptions({
    queryKey: queryKeys.tools.body(spanId),
    queryFn: () => fetchBody({ data: spanId }),
    staleTime: STALE_TELEMETRY_MS,
  })
