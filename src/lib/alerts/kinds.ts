// Single source of truth for the four alert kinds detection emits. The inbox uses
// `label` (short, for the row chip / Kind facet); the home dashboard uses `title`
// and `blurb` (panel header + tooltip). Same taxonomy, two framings.
export type AlertKind = 'new_tool' | 'new_agent' | 'tool_error_rate' | 'tool_size_p95'

export interface AlertKindMeta {
  label: string
  title: string
  blurb: string
}

export const ALERT_KINDS: Record<AlertKind, AlertKindMeta> = {
  new_tool: {
    label: 'New tool',
    title: 'New MCP tools',
    blurb: 'First seen in this window',
  },
  new_agent: {
    label: 'New agent',
    title: 'New agents',
    blurb: 'First seen in this window',
  },
  tool_error_rate: {
    label: 'Tool error rate',
    title: 'Tools with high error rate',
    blurb: 'Top by error rate. Target: <1% per tool.',
  },
  tool_size_p95: {
    label: 'Tool output size',
    title: 'Tools returning too much',
    blurb: 'Top by p95 result size. Target: <2k tokens per call to keep context lean.',
  },
}

export const ALERT_KIND_OPTIONS = (Object.keys(ALERT_KINDS) as AlertKind[]).map((value) => ({
  value,
  label: ALERT_KINDS[value].label,
}))
