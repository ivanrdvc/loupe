// OTel attribute aliasing for fields where producers legitimately use
// different names (LLM tokens, cost, session id, model). The agentops
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
  totalTokens: ['gen_ai.usage.total_tokens'],
  inputTokens: ['gen_ai.usage.input_tokens'],
  outputTokens: ['gen_ai.usage.output_tokens'],
  costUsd: ['gen_ai.usage.cost_total'],
  provider: ['gen_ai.provider.name', 'gen_ai.system'],
  cacheReadTokens: [
    'gen_ai.usage.cache_read.input_tokens',
    'gen_ai.usage.cache_read_input_tokens',
    'llm.usage.cache_read_tokens',
  ],
  llmInput: ['gen_ai.input.messages', 'llm.input'],
  // OTel-stable as of Q1 2026. CUSTOM_LLM_PURPOSE_FIELD plumbing is gone —
  // producers must conform to this name.
  llmPurpose: ['gen_ai.operation.purpose'],
} as const

export type CanonicalField = keyof typeof ATTRS

function bothForms(keys: readonly string[]): string[] {
  const out: string[] = []
  for (const k of keys) {
    out.push(k)
    const flat = k.replaceAll('.', '_')
    if (flat !== k) out.push(flat)
  }
  return out
}

export function attrKeysFor(field: CanonicalField): readonly string[] {
  return bothForms(ATTRS[field])
}

export function pickCanonical(attrs: Record<string, unknown>, field: CanonicalField): string | undefined {
  for (const k of attrKeysFor(field)) {
    const v = attrs[k]
    if (typeof v === 'string' && v.length > 0) return v
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

// customDimensions is a single map column on AI, so column existence is N/A.
// Both dotted and underscored forms must be checked: some .NET OTel
// instrumentations write `ag_ui_thread_id` into customDimensions, while
// others write `ag_ui.thread_id`.
export function aiCoalesce(field: CanonicalField): string {
  const all = bothForms([...ATTRS[field]])
  return `coalesce(${all.map((k) => `tostring(customDimensions["${k}"])`).join(', ')})`
}
