import type { LintCategory, LintSeverity, McpLintFinding } from '../types'

const SEVERITY_RANK: Record<LintSeverity, number> = { error: 3, warning: 2, info: 1 }

const LINT_CATEGORY_ORDER: LintCategory[] = ['server-health', 'tool-catalog', 'naming']

export const LINT_CATEGORY_LABELS: Record<LintCategory, string> = {
  'server-health': 'Server health',
  'tool-catalog': 'Tool catalog',
  naming: 'Naming',
}

function severityRank(severity: LintSeverity): number {
  return SEVERITY_RANK[severity]
}

function bySeverityDesc(a: McpLintFinding, b: McpLintFinding): number {
  return severityRank(b.severity) - severityRank(a.severity)
}

export function worstSeverity(findings: McpLintFinding[]): LintSeverity | null {
  let worst: LintSeverity | null = null
  for (const f of findings) {
    if (!worst || severityRank(f.severity) > severityRank(worst)) worst = f.severity
  }
  return worst
}

export function findingsForServer(findings: McpLintFinding[], serverId: string): McpLintFinding[] {
  return findings.filter((f) => f.serverId === serverId)
}

export interface LintGroup {
  category: LintCategory
  findings: McpLintFinding[]
}

export function groupFindingsByCategory(findings: McpLintFinding[]): LintGroup[] {
  return LINT_CATEGORY_ORDER.map((category) => ({
    category,
    findings: findings.filter((f) => f.category === category).sort(bySeverityDesc),
  })).filter((group) => group.findings.length > 0)
}
