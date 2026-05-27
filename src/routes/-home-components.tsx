import { ArrowTopRightOnSquareIcon, ChevronDownIcon } from '@heroicons/react/20/solid'
import { IconInfoCircle } from '@tabler/icons-react'
import { Link } from '@tanstack/react-router'
import { useState } from 'react'
import { RelativeTime } from '#/components/relative-time'
import { ToolLink } from '#/components/tool-link'
import { Badge } from '#/components/ui/badge'
import { Card, CardAction, CardContent, CardHeader, CardTitle } from '#/components/ui/card'
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from '#/components/ui/empty'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '#/components/ui/table'
import { Tooltip, TooltipContent, TooltipTrigger } from '#/components/ui/tooltip'
import { formatPercent, formatTokens } from '#/lib/format'
import type { ToolErrorRow, ToolPayloadRow } from '#/lib/telemetry'
import type { InventoryRow } from '#/server/inbox'

const PREVIEW_ROWS = 5

export function Section({
  title,
  description,
  action,
  children,
  wide,
}: {
  title: string
  description?: string
  action?: React.ReactNode
  children: React.ReactNode
  wide?: boolean
}) {
  return (
    <Card className={wide ? 'xl:col-span-2' : ''}>
      <CardHeader>
        <CardTitle className="flex items-center gap-1.5">
          {title}
          {description && (
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  aria-label={`About ${title}`}
                  className="cursor-help text-muted-foreground hover:text-foreground"
                >
                  <IconInfoCircle className="size-3.5" />
                </button>
              </TooltipTrigger>
              <TooltipContent>{description}</TooltipContent>
            </Tooltip>
          )}
        </CardTitle>
        {action && <CardAction>{action}</CardAction>}
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  )
}

export function SectionEmpty({ title, description }: { title: string; description?: string }) {
  return (
    <Empty className="py-4">
      <EmptyHeader>
        <EmptyTitle className="text-xs">{title}</EmptyTitle>
        {description && <EmptyDescription className="text-xs">{description}</EmptyDescription>}
      </EmptyHeader>
    </Empty>
  )
}

export function Expandable<T>({ rows, children }: { rows: T[]; children: (visible: T[]) => React.ReactNode }) {
  const [expanded, setExpanded] = useState(false)
  const hasMore = rows.length > PREVIEW_ROWS
  const visible = expanded || !hasMore ? rows : rows.slice(0, PREVIEW_ROWS)
  return (
    <>
      {children(visible)}
      {hasMore && (
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="mt-2 inline-flex cursor-pointer items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground"
        >
          <ChevronDownIcon className={`size-3.5 transition-transform ${expanded ? 'rotate-180' : ''}`} />
          {expanded ? 'Show less' : `Show more (${rows.length - PREVIEW_ROWS})`}
        </button>
      )}
    </>
  )
}

export function OpenLink({ traceId, sessionId }: { traceId?: string | null; sessionId?: string | null }) {
  const cls = 'inline-flex items-center text-muted-foreground hover:text-foreground'
  if (sessionId) {
    return (
      <Link to="/sessions" search={{ session: sessionId }} className={cls} aria-label="Open session">
        <ArrowTopRightOnSquareIcon className="size-3.5" />
      </Link>
    )
  }
  if (traceId) {
    return (
      <Link to="." search={(prev) => ({ ...(prev as object), trace: traceId })} className={cls} aria-label="Open trace">
        <ArrowTopRightOnSquareIcon className="size-3.5" />
      </Link>
    )
  }
  return (
    <Link to="/sessions" className={cls} aria-label="Open sessions">
      <ArrowTopRightOnSquareIcon className="size-3.5" />
    </Link>
  )
}

const CHARS_PER_TOKEN = 4

function Chars({ chars }: { chars: number }) {
  if (!chars) return <span className="text-muted-foreground">—</span>
  const tokens = Math.ceil(chars / CHARS_PER_TOKEN)
  return (
    <span title={`${chars.toLocaleString()} chars · ≈${tokens.toLocaleString()} tokens`}>
      {formatTokens(tokens)}
      <span className="text-muted-foreground"> tok</span>
    </span>
  )
}

function stripPrefix(name: string, prefix: string): string {
  return name.startsWith(`${prefix} `) ? name.slice(prefix.length + 1) : name
}

export function ToolErrorTable({ rows }: { rows: ToolErrorRow[] }) {
  if (rows.length === 0) {
    return <SectionEmpty title="No errored tool calls" description="Nothing failed in this window." />
  }
  return (
    <Expandable rows={rows}>
      {(visible) => (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Tool</TableHead>
              <TableHead className="w-20 text-right tabular-nums">Errors</TableHead>
              <TableHead className="w-20 text-right tabular-nums">Calls</TableHead>
              <TableHead className="w-20 text-right tabular-nums">Rate ▼</TableHead>
              <TableHead className="w-8" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {visible.map((row) => (
              <TableRow key={row.name}>
                <TableCell className="max-w-0 truncate" title={row.name}>
                  <ToolLink name={stripPrefix(row.name, 'execute_tool')} />
                </TableCell>
                <TableCell className="text-right tabular-nums">{row.errors}</TableCell>
                <TableCell className="text-right tabular-nums">{row.total}</TableCell>
                <TableCell className="text-right">
                  <Badge variant="destructive">{formatPercent(row.errorRate, 1)}</Badge>
                </TableCell>
                <TableCell>
                  <OpenLink traceId={row.lastErrorTraceId} />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </Expandable>
  )
}

export function ToolPayloadTable({ rows }: { rows: ToolPayloadRow[] }) {
  if (rows.length === 0) {
    return <SectionEmpty title="No tool-call payloads" description="No execute_tool spans in this window." />
  }
  return (
    <Expandable rows={rows}>
      {(visible) => (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Tool</TableHead>
              <TableHead className="w-20 text-right tabular-nums">Avg</TableHead>
              <TableHead className="w-20 text-right tabular-nums">p95 ▼</TableHead>
              <TableHead className="w-20 text-right tabular-nums">Max</TableHead>
              <TableHead className="w-16" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {visible.map((row) => (
              <TableRow key={row.name}>
                <TableCell className="max-w-0 truncate" title={row.name}>
                  <ToolLink name={stripPrefix(row.name, 'execute_tool')} />
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  <Chars chars={row.avgChars} />
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  <Chars chars={row.p95Chars} />
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  <Chars chars={row.maxChars} />
                </TableCell>
                <TableCell>
                  <OpenLink traceId={row.sampleTraceId} sessionId={row.sampleSessionId} />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </Expandable>
  )
}

export function NewToolsTable({ rows }: { rows: InventoryRow[] }) {
  if (rows.length === 0) {
    return <SectionEmpty title="No new MCP tools" description="Nothing newly observed in this window." />
  }
  const visible = rows.slice(0, PREVIEW_ROWS)
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Tool</TableHead>
          <TableHead>Server</TableHead>
          <TableHead>First seen</TableHead>
          <TableHead />
        </TableRow>
      </TableHeader>
      <TableBody>
        {visible.map((row) => (
          <TableRow key={row.id}>
            <TableCell>
              <ToolLink name={row.name} />
            </TableCell>
            <TableCell>{row.namespace || 'unknown'}</TableCell>
            <TableCell className="tabular-nums text-muted-foreground">
              <RelativeTime ts={row.firstSeenAtMs} />
            </TableCell>
            <TableCell>
              <OpenLink traceId={row.firstSeenTraceId} />
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  )
}

export function NewAgentsTable({ rows }: { rows: InventoryRow[] }) {
  if (rows.length === 0) {
    return <SectionEmpty title="No new agents" description="Nothing newly observed in this window." />
  }
  return (
    <Expandable rows={rows}>
      {(visible) => (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Agent</TableHead>
              <TableHead>First seen</TableHead>
              <TableHead>Last seen</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {visible.map((row) => (
              <TableRow key={row.id}>
                <TableCell className="font-medium">{row.name}</TableCell>
                <TableCell className="tabular-nums text-muted-foreground">
                  <RelativeTime ts={row.firstSeenAtMs} />
                </TableCell>
                <TableCell className="tabular-nums text-muted-foreground">
                  <RelativeTime ts={row.lastSeenAtMs} />
                </TableCell>
                <TableCell>
                  <OpenLink traceId={row.firstSeenTraceId} />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </Expandable>
  )
}
