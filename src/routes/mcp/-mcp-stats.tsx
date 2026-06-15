import { useMemo } from 'react'
import type { McpLintFinding, McpServer } from '#/features/mcp'
import { cn } from '#/lib/utils'

export function McpStats({ servers, findings }: { servers: McpServer[]; findings: McpLintFinding[] }) {
  const stats = useMemo(
    () => ({
      servers: servers.length,
      tools: servers.reduce((n, s) => n + s.tools.length, 0),
      lint: findings.length,
    }),
    [servers, findings],
  )

  return (
    <dl className="flex items-start gap-8 px-4 py-3 text-sm lg:px-6">
      <Stat label="Servers" value={stats.servers} />
      <Stat label="Tools" value={stats.tools} />
      <Stat label="Lint" value={stats.lint} tone={stats.lint > 0 ? 'warning' : undefined} />
    </dl>
  )
}

const TONE = { error: 'text-destructive', warning: 'text-warning' } as const

function Stat({ label, value, tone }: { label: string; value: number; tone?: keyof typeof TONE }) {
  return (
    <div className="flex flex-col gap-0.5">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className={cn('tabular-nums', tone && TONE[tone])}>{value}</dd>
    </div>
  )
}
