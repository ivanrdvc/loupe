import type { ReactNode } from 'react'
import { Badge } from '#/components/ui/badge'
import { type LintSeverity, type McpLintFinding, type McpServer, worstSeverity } from '#/features/mcp'

const SEVERITY_VARIANT = { error: 'destructive', warning: 'warning', info: 'secondary' } as const
const STATUS_VARIANT = { ok: 'success', error: 'destructive', skipped: 'secondary' } as const

export function SeverityBadge({ severity, children }: { severity: LintSeverity; children?: ReactNode }) {
  return (
    <Badge variant={SEVERITY_VARIANT[severity]} className="capitalize">
      {children ?? severity}
    </Badge>
  )
}

export function FindingsBadge({ findings }: { findings: McpLintFinding[] }) {
  const worst = worstSeverity(findings)
  if (!worst) return <span className="text-muted-foreground">—</span>
  return <Badge variant={SEVERITY_VARIANT[worst]}>{findings.length}</Badge>
}

export function StatusBadge({ status }: { status: McpServer['fetchStatus'] }) {
  return (
    <Badge variant={STATUS_VARIANT[status]} className="capitalize">
      {status}
    </Badge>
  )
}
