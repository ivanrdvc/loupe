import type { McpTool, McpToolAnnotations } from '../types'
import { deriveSignals, type SignalVocabOverrides, TOOL_SIGNAL_DESCRIPTIONS, type ToolSignal } from './signals'

export type FacetGroup = 'annotation' | 'signal' | 'tag'
export type FacetTone = 'outline' | 'warning' | 'destructive' | 'secondary'

export interface ToolFacet {
  id: string
  label: string
  group: FacetGroup
  tone: FacetTone
  description?: string
}

export const GROUP_ORDER: Record<FacetGroup, number> = { annotation: 0, signal: 1, tag: 2 }

// Dedup facets across many tools into sorted filter options (value = facet id).
export function facetOptions(groups: Iterable<readonly ToolFacet[]>): { value: string; label: string }[] {
  const byId = new Map<string, string>()
  for (const fs of groups) for (const f of fs) byId.set(f.id, f.label)
  return [...byId.entries()].map(([value, label]) => ({ value, label })).sort((a, b) => a.label.localeCompare(b.label))
}

const ANNOTATION_FACETS: {
  key: keyof McpToolAnnotations
  id: string
  label: string
  tone: FacetTone
  description: string
}[] = [
  {
    key: 'destructiveHint',
    id: 'destructive',
    label: 'destructive',
    tone: 'destructive',
    description: 'May perform irreversible updates or deletes.',
  },
  { key: 'readOnlyHint', id: 'read-only', label: 'read-only', tone: 'outline', description: 'Does not modify state.' },
  {
    key: 'idempotentHint',
    id: 'idempotent',
    label: 'idempotent',
    tone: 'outline',
    description: 'Repeated calls with the same args have no additional effect.',
  },
  {
    key: 'openWorldHint',
    id: 'open-world',
    label: 'open-world',
    tone: 'outline',
    description: 'Interacts with external entities beyond the server.',
  },
]

const SIGNAL_TONE = (s: ToolSignal): FacetTone => (s === 'unbounded' || s === 'bulk' ? 'warning' : 'outline')

// For name-keyed surfaces (e.g. /tools) that only have derived signals, no schema/annotations.
export function signalFacets(signals: readonly ToolSignal[]): ToolFacet[] {
  return signals.map((s) => ({
    id: s,
    label: s,
    group: 'signal',
    tone: SIGNAL_TONE(s),
    description: TOOL_SIGNAL_DESCRIPTIONS[s],
  }))
}

// Single source of truth for a tool's badge-able attributes. Forks pile on by
// populating TOOL_TAGS, extending SIGNAL_VOCAB, or wrapping this function.
export function toolFacets(
  tool: Pick<McpTool, 'name' | 'inputSchema' | 'annotations'>,
  tags: string[] = [],
  signalOverrides?: SignalVocabOverrides,
): ToolFacet[] {
  const facets: ToolFacet[] = []

  if (tool.annotations) {
    for (const a of ANNOTATION_FACETS) {
      if (tool.annotations[a.key])
        facets.push({ id: a.id, label: a.label, group: 'annotation', tone: a.tone, description: a.description })
    }
  }

  for (const s of deriveSignals(tool, signalOverrides))
    facets.push({ id: s, label: s, group: 'signal', tone: SIGNAL_TONE(s), description: TOOL_SIGNAL_DESCRIPTIONS[s] })

  for (const tag of tags) facets.push({ id: tag, label: tag, group: 'tag', tone: 'secondary' })

  const seen = new Set<string>()
  return facets
    .filter((f) => (seen.has(f.id) ? false : seen.add(f.id)))
    .sort((a, b) => GROUP_ORDER[a.group] - GROUP_ORDER[b.group])
}
