import { Link } from '@tanstack/react-router'
import { AlertCircle, AlertTriangle, Info } from 'lucide-react'
import { Item, ItemContent, ItemDescription, ItemMedia } from '#/components/ui/item'
import type { LintSeverity, McpLintFinding } from '#/features/mcp'
import { cn } from '#/lib/utils'

const SEVERITY: Record<LintSeverity, { Icon: typeof AlertCircle; className: string }> = {
  error: { Icon: AlertCircle, className: 'text-destructive' },
  warning: { Icon: AlertTriangle, className: 'text-warning' },
  info: { Icon: Info, className: 'text-muted-foreground' },
}

export function LintFindingRow({ finding }: { finding: McpLintFinding }) {
  const { Icon, className } = SEVERITY[finding.severity]
  return (
    <Item className="rounded-none px-4">
      <ItemMedia variant="icon">
        <Icon className={cn('size-4', className)} />
      </ItemMedia>
      <ItemContent className="gap-1">
        <ItemDescription className="line-clamp-none text-foreground">{finding.message}</ItemDescription>
        <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-muted-foreground">
          <Link to="/mcp/$serverId" params={{ serverId: finding.serverId }} className="hover:text-foreground">
            {finding.serverName}
          </Link>
          {finding.toolName && <span className="font-mono">· {finding.toolName}</span>}
          <code className="ml-auto rounded bg-muted px-1.5 py-0.5 font-mono text-[11px]">{finding.ruleId}</code>
        </div>
      </ItemContent>
    </Item>
  )
}
