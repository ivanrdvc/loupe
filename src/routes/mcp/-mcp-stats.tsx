import { useMemo } from 'react'
import { aggregateTools, type McpLintFinding, type McpServer } from '#/features/mcp'
import { cn } from '#/lib/utils'

export function McpStats({ servers, findings }: { servers: McpServer[]; findings: McpLintFinding[] }) {
  const stats = useMemo(() => {
    const unique = aggregateTools(servers)
    return {
      servers: servers.length,
      erroring: servers.filter((s) => s.fetchStatus === 'error').length,
      tools: servers.reduce((n, s) => n + s.tools.length, 0),
      unique: unique.length,
      conflicts: unique.filter((u) => u.conflict).length,
      lintErrors: findings.filter((f) => f.severity === 'error').length,
      lintWarnings: findings.filter((f) => f.severity === 'warning').length,
    }
  }, [servers, findings])

  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-2 text-xs text-muted-foreground lg:px-6">
      <Stat value={stats.servers} label="servers" />
      <Stat value={stats.tools} label="tools" />
      <Stat value={stats.unique} label="unique" />
      {stats.conflicts > 0 && <Stat value={stats.conflicts} label="conflicts" tone="error" />}
      {stats.erroring > 0 && <Stat value={stats.erroring} label="unreachable" tone="error" />}
      {stats.lintErrors > 0 && <Stat value={stats.lintErrors} label="errors" tone="error" />}
      {stats.lintWarnings > 0 && <Stat value={stats.lintWarnings} label="warnings" tone="warning" />}
    </div>
  )
}

const TONE = { error: 'text-destructive', warning: 'text-warning' } as const

function Stat({ value, label, tone }: { value: number; label: string; tone?: keyof typeof TONE }) {
  return (
    <span className={cn('tabular-nums', tone && TONE[tone])}>
      <span className="font-medium text-foreground">{value}</span> {label}
    </span>
  )
}
