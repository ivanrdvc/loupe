import { SIGNAL_VOCAB } from '../signal-vocab'
import type { McpTool } from '../types'

// Cost/scale signals from a tool's name + schema — which tools won't bound their
// result size as data grows (`get_all_employees`, no pagination → balloons context).
export const TOOL_SIGNALS = ['paginated', 'unbounded', 'bulk', 'self-scoped', 'filterable'] as const
export type ToolSignal = (typeof TOOL_SIGNALS)[number]

export const TOOL_SIGNAL_DESCRIPTIONS: Record<ToolSignal, string> = {
  paginated: 'Accepts a cursor/limit/offset — the caller can bound result size.',
  unbounded: 'Returns a collection but takes no pagination or filter param. Result size grows with the data.',
  bulk: 'Org-wide scope (all/every/org). Result set scales with headcount.',
  'self-scoped': 'Scoped to the caller (my/me). Bounded regardless of org size.',
  filterable: 'Accepts a filter/query/date param to narrow results.',
}

// A fork extends any list via SIGNAL_VOCAB — entries union onto the defaults.
export type SignalVocabOverrides = {
  paginationParams?: string[]
  filterParams?: string[]
  listWords?: string[]
  bulkWords?: string[]
  selfWords?: string[]
}

const BASE_PAGINATION_PARAMS = [
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
]

const BASE_FILTER_PARAMS = [
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
]

const BASE_LIST_WORDS = ['list', 'search', 'find', 'query', 'all', 'export', 'browse']
const BASE_BULK_WORDS = ['all', 'every', 'bulk', 'org', 'organization', 'company', 'global', 'everyone']
const BASE_SELF_WORDS = ['my', 'me', 'self', 'mine', 'current']

type CompiledVocab = {
  paginationParams: Set<string>
  filterParams: Set<string>
  listRe: RegExp
  bulkRe: RegExp
  selfRe: RegExp
}

function paramSet(base: string[], extra?: string[]): Set<string> {
  return new Set([...base, ...(extra ?? [])].map((p) => p.toLowerCase()))
}

function wordRe(base: string[], extra?: string[]): RegExp {
  return new RegExp(`(^|[_-])(${[...base, ...(extra ?? [])].join('|')})([_-]|$)`, 'i')
}

function compile(o: SignalVocabOverrides): CompiledVocab {
  return {
    paginationParams: paramSet(BASE_PAGINATION_PARAMS, o.paginationParams),
    filterParams: paramSet(BASE_FILTER_PARAMS, o.filterParams),
    listRe: wordRe(BASE_LIST_WORDS, o.listWords),
    bulkRe: wordRe(BASE_BULK_WORDS, o.bulkWords),
    selfRe: wordRe(BASE_SELF_WORDS, o.selfWords),
  }
}

const DEFAULT_VOCAB = compile(SIGNAL_VOCAB)

export function deriveSignals(tool: McpTool, overrides: SignalVocabOverrides = SIGNAL_VOCAB): ToolSignal[] {
  const vocab = overrides === SIGNAL_VOCAB ? DEFAULT_VOCAB : compile(overrides)
  const params = schemaParamNames(tool.inputSchema).map((p) => p.toLowerCase())
  const name = tool.name.toLowerCase()

  const paginated = params.some((p) => vocab.paginationParams.has(p))
  const filterable = params.some((p) => vocab.filterParams.has(p))
  const bulk = vocab.bulkRe.test(name)
  const selfScoped = vocab.selfRe.test(name)
  const listLike = vocab.listRe.test(name) || bulk

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
