// OTel attribute aliasing for fields where producers legitimately use
// different names (LLM tokens, cost, session id, model). The loupe
// convention spec only pins agent-identity attrs; everything else stays
// multi-alias so we can ingest from Langfuse / Pydantic / OpenLLMetry /
// OpenInference / AG-UI without each producer having to conform.

// Names use dotted (semconv) form. OO flattens to underscores at ingest;
// AI keeps the dotted key inside customDimensions; in-memory lookups try
// both forms via bothForms().
const ATTRS = {
  sessionId: [
    'ag_ui.thread_id',
    'session.id',
    'gen_ai.conversation.id',
    'langfuse.session.id',
    'openinference.session.id',
  ],
  sessionTitle: ['ag_ui.thread.title', 'session.title', 'thread.title', 'gen_ai.conversation.title'],
  userId: ['user.id', 'enduser.id', 'ag_ui.user.id'],
  userName: ['user.name', 'enduser.name'],
  host: ['host.name'],
  model: ['gen_ai.request.model', 'gen_ai.response.model'],
  totalTokens: ['gen_ai.usage.total_tokens', 'llm.usage.tokens_total'],
  inputTokens: ['gen_ai.usage.input_tokens', 'llm.usage.tokens_input'],
  outputTokens: ['gen_ai.usage.output_tokens', 'llm.usage.tokens_output'],
  costUsd: ['gen_ai.usage.cost_total', 'gen_ai.usage.cost', 'llm.usage.cost_total'],
  provider: ['gen_ai.provider.name', 'gen_ai.system'],
  agentName: ['gen_ai.agent.name'],
  cacheReadTokens: [
    'gen_ai.usage.cache_read.input_tokens',
    'gen_ai.usage.cache_read_input_tokens',
    'llm.usage.cache_read_tokens',
  ],
  llmInput: ['gen_ai.input.messages', 'llm.input'],
  llmOutput: ['gen_ai.output.messages', 'llm.output'],
  // OTel-stable as of Q1 2026. CUSTOM_LLM_PURPOSE_FIELD plumbing is gone —
  // producers must conform to this name.
  llmPurpose: ['gen_ai.operation.purpose'],
  // Run-graph parent id — marks a span as a sub-agent (docs/explanation/02-spec.md).
  taskParentId: ['gen_ai.task.parent.id', 'graph.node.parent_id'],
  // loupe-convention scheduling + trigger identity (docs/explanation/02-spec.md).
  triggerType: ['session.trigger_type'],
  execution: ['session.execution'],
  taskId: ['task.id'],
  taskKind: ['task.kind'],
  taskSchedule: ['task.schedule'],
  taskName: ['task.name'],
  taskSource: ['task.source'],
} as const

import type { IdentityFilter } from './types'

export type CanonicalField = keyof typeof ATTRS

// Exact-match dims (besides the userId/userName pick) ANDed into the provider
// WHERE. Forks append company id here plus its ATTRS alias — the one edit point.
export const IDENTITY_FILTERS = [{ key: 'host', field: 'host' }] as const satisfies readonly {
  key: keyof IdentityFilter
  field: CanonicalField
}[]

// Span dimensions the tool catalog can be filtered by. Forks append company id
// here (plus its alias in ATTRS) — the one edit point; everything else is generic.
export const TOOL_DIMENSIONS = [{ key: 'user', label: 'User', field: 'userId' }] as const satisfies readonly {
  key: string
  label: string
  field: CanonicalField
}[]

export function isToolDimensionField(field: string): field is CanonicalField {
  return TOOL_DIMENSIONS.some((d) => d.field === field)
}

function bothForms(keys: readonly string[]): string[] {
  return keys.flatMap((k) => {
    const flat = k.replaceAll('.', '_')
    return flat === k ? [k] : [k, flat]
  })
}

export function attrKeysFor(field: CanonicalField): readonly string[] {
  return bothForms(ATTRS[field])
}

export function pickCanonical(attrs: Record<string, unknown>, field: CanonicalField): string | undefined {
  for (const k of attrKeysFor(field)) {
    const v = attrs[k]
    if (typeof v !== 'string') continue
    const t = v.trim()
    if (t) return t
  }
  return undefined
}

// Accepts numeric strings — OO serializes some SUM aggregates as strings.
export function pickCanonicalNumber(attrs: Record<string, unknown>, field: CanonicalField): number | undefined {
  for (const k of attrKeysFor(field)) {
    const v = attrs[k]
    if (typeof v === 'number' && Number.isFinite(v)) return v
    if (typeof v === 'string' && v.length > 0) {
      const n = Number(v)
      if (Number.isFinite(n)) return n
    }
  }
  return undefined
}

// `extras` carries OO-specific column quirks (`_o2_*` prefixes that aren't
// OTel attrs). `known` is the schema-probe result; if absent, no filtering.
export interface OoColumnOpts {
  known?: ReadonlySet<string>
  extras?: readonly string[]
}

export function ooColumns(field: CanonicalField, opts?: OoColumnOpts): string[] {
  const base = ATTRS[field].map((k) => k.replaceAll('.', '_'))
  const explicit = opts?.extras ?? []
  const cols = [...new Set([...base, ...explicit])]
  return opts?.known ? cols.filter((c) => opts.known?.has(c)) : cols
}

export function ooCoalesceAs(field: CanonicalField, alias: string, opts?: OoColumnOpts): string {
  const cols = ooColumns(field, opts)
  if (cols.length === 0) return `'' AS ${alias}`
  if (cols.length === 1) return `${cols[0]} AS ${alias}`
  return `COALESCE(${cols.join(', ')}) AS ${alias}`
}

// Bare column expression (no alias) for embedding inside a larger SQL
// expression — e.g. a conditional aggregate `MAX(CASE WHEN … THEN <here> END)`.
// Returns 'NULL' when no candidate column exists in the schema, so the query
// plans instead of 400ing on an unknown field.
export function ooCol(field: CanonicalField, known: ReadonlySet<string>): string {
  const cols = ooColumns(field, { known })
  if (cols.length === 0) return 'NULL'
  if (cols.length === 1) return cols[0]
  return `COALESCE(${cols.join(', ')})`
}

// Promoted ClickHouse columns, MATERIALIZED at ingest from the attr maps
// (infra/clickhouse/init/01-traces.sql — keep in sync). Everything the UI
// filters/sorts/facets by must resolve to one of these, never a Map probe.
// Missing values are '' / 0, not NULL. Forks add company id in ATTRS + the
// DDL + here.
const CH_COLUMNS = {
  sessionId: 'SessionId',
  sessionTitle: 'SessionTitle',
  userId: 'UserId',
  userName: 'UserName',
  host: 'Host',
  agentName: 'AgentName',
  model: 'Model',
  totalTokens: 'TotalTokens',
  inputTokens: 'InputTokens',
  outputTokens: 'OutputTokens',
  cacheReadTokens: 'CacheReadTokens',
  costUsd: 'CostUsd',
  provider: 'Provider',
  llmPurpose: 'Purpose',
  triggerType: 'TriggerType',
  execution: 'Execution',
  taskParentId: 'TaskParentId',
  taskId: 'TaskId',
  taskKind: 'TaskKind',
  taskSchedule: 'TaskSchedule',
  taskName: 'TaskName',
  taskSource: 'TaskSource',
} as const satisfies Partial<Record<CanonicalField, string>>

// Column (or Map-coalesce expression for the few non-promoted fields — those
// only appear on detail paths, never in hot WHERE/GROUP BY).
export function chCol(field: CanonicalField): string {
  const col = (CH_COLUMNS as Partial<Record<CanonicalField, string>>)[field]
  if (col) return col
  const keys = ATTRS[field]
  if (keys.length === 1) return `SpanAttributes['${keys[0]}']`
  return `arrayFirst(v -> v != '', [${keys.map((k) => `SpanAttributes['${k}']`).join(', ')}])`
}

// customDimensions is a single map column on AI, so column existence is N/A.
// Both dotted and underscored forms must be checked: some .NET OTel
// instrumentations write `ag_ui_thread_id` into customDimensions, while
// others write `ag_ui.thread_id`.
export function aiCoalesce(field: CanonicalField): string {
  const all = bothForms(ATTRS[field])
  return `coalesce(${all.map((k) => `tostring(customDimensions["${k}"])`).join(', ')})`
}
