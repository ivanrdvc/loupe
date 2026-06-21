import { useMemo } from 'react'
import type { FacetedFilterSpec } from '#/components/data-table-toolbar'
import { LINT_CATEGORY_LABELS, type McpLintFinding } from '#/features/mcp'
import { lintColumns } from './-lint-columns'
import { McpDataTable } from './-mcp-data-table'

const LINT_FILTERS: FacetedFilterSpec[] = [
  {
    columnId: 'severity',
    title: 'Severity',
    options: [
      { label: 'Error', value: 'error' },
      { label: 'Warning', value: 'warning' },
      { label: 'Info', value: 'info' },
    ],
  },
  {
    columnId: 'category',
    title: 'Category',
    options: Object.entries(LINT_CATEGORY_LABELS).map(([value, label]) => ({ label, value })),
  },
]

export function LintFindings({ findings }: { findings: McpLintFinding[] }) {
  const columns = useMemo(() => lintColumns(), [])
  return (
    <McpDataTable
      columns={columns}
      data={findings}
      getRowId={(f) => `${f.ruleId}:${f.serverId}:${f.toolName ?? ''}`}
      searchColumnId="server"
      searchPlaceholder="Filter by server…"
      filters={LINT_FILTERS}
      initialSorting={[{ id: 'severity', desc: false }]}
      emptyMessage="Every registered server and tool passed the lint rules."
    />
  )
}
