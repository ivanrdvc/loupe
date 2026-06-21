import type { McpTool } from '../types'

// Cost/scale signals derived from a tool's name + schema — which tools won't
// scale as the org grows (`get_all_employees` with no pagination balloons context).
export const TOOL_SIGNALS = ['paginated', 'unbounded', 'bulk', 'self-scoped', 'filterable'] as const
export type ToolSignal = (typeof TOOL_SIGNALS)[number]

export const TOOL_SIGNAL_DESCRIPTIONS: Record<ToolSignal, string> = {
  paginated: 'Accepts a cursor/limit/offset — the caller can bound result size.',
  unbounded: 'Returns a collection but takes no pagination or filter param. Result size grows with the data.',
  bulk: 'Org-wide scope (all/every/org). Result set scales with headcount.',
  'self-scoped': 'Scoped to the caller (my/me). Bounded regardless of org size.',
  filterable: 'Accepts a filter/query/date param to narrow results.',
}

const PAGINATION_PARAMS = new Set([
  'cursor',
  'page',
  'page_token',
  'pagetoken',
  'offset',
  'limit',
  'page_size',
  'pagesize',
  'per_page',
  'perpage',
  'after',
  'before',
  'max_results',
  'maxresults',
  'top',
  'skip',
])

const FILTER_PARAMS = new Set([
  'filter',
  'filters',
  'query',
  'q',
  'search',
  'since',
  'until',
  'where',
  'status',
  'from',
  'to',
  'start_date',
  'end_date',
  'date',
])

const LIST_NAME = /(^|[_-])(list|search|find|query|all|export|browse)([_-]|$)/i
const BULK_SCOPE = /(^|[_-])(all|every|bulk|org|organization|company|global|everyone)([_-]|$)/i
const SELF_SCOPE = /(^|[_-])(my|me|self|mine|current)([_-]|$)/i

export function deriveSignals(tool: McpTool): ToolSignal[] {
  const params = schemaParamNames(tool.inputSchema).map((p) => p.toLowerCase())
  const name = tool.name.toLowerCase()

  const paginated = params.some((p) => PAGINATION_PARAMS.has(p))
  const filterable = params.some((p) => FILTER_PARAMS.has(p))
  const bulk = BULK_SCOPE.test(name)
  const selfScoped = SELF_SCOPE.test(name)
  const listLike = LIST_NAME.test(name) || bulk

  const signals = new Set<ToolSignal>()
  if (paginated) signals.add('paginated')
  if (filterable) signals.add('filterable')
  if (bulk) signals.add('bulk')
  if (selfScoped) signals.add('self-scoped')
  // The scale risk: returns a collection but the caller can't bound it.
  if (listLike && !paginated && !filterable && !selfScoped) signals.add('unbounded')

  return TOOL_SIGNALS.filter((s) => signals.has(s))
}

function schemaParamNames(schema: unknown): string[] {
  if (!schema || typeof schema !== 'object' || !('properties' in schema)) return []
  const props = (schema as { properties?: unknown }).properties
  if (!props || typeof props !== 'object') return []
  return Object.keys(props as Record<string, unknown>)
}
