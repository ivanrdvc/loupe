import { ArrowTopRightOnSquareIcon, ChevronDownIcon } from '@heroicons/react/20/solid'
import { Link } from '@tanstack/react-router'
import { useMemo, useState } from 'react'
import { MiniBarChart } from '#/components/mini-bar-chart'
import { Badge } from '#/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '#/components/ui/card'
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from '#/components/ui/empty'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '#/components/ui/table'
import { formatAgo, formatDuration, formatTokens } from '#/lib/format'
import type { LatencyRow, ToolBucketPoint, ToolErrorRow, ToolPayloadRow, ToolSpark } from '#/lib/telemetry'
import type { InventoryRow } from '#/server/inbox'

const PREVIEW_ROWS = 5

export function CategoryGroup({
  label,
  showLabel,
  children,
}: {
  label: string
  showLabel: boolean
  children: React.ReactNode
}) {
  return (
    <div className="flex flex-col gap-2 px-4 lg:px-6">
      {showLabel && (
        <h2 className="text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">{label}</h2>
      )}
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">{children}</div>
    </div>
  )
}

export function Section({
  icon: Icon,
  title,
  children,
}: {
  icon: React.ComponentType<{ className?: string }>
  title: string
  children: React.ReactNode
}) {
  return (
    <Card className="gap-3 py-3">
      <CardHeader className="flex flex-row items-center gap-2 px-3 [.border-b]:pb-3">
        <Icon className="size-4 fill-primary" />
        <CardTitle className="text-sm font-semibold">{title}</CardTitle>
      </CardHeader>
      <CardContent className="px-3">{children}</CardContent>
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

export function OpenLink({ traceId }: { traceId?: string | null }) {
  const cls = 'inline-flex items-center text-muted-foreground hover:text-foreground'
  if (traceId) {
    return (
      <Link to="/runs/$runId" params={{ runId: traceId }} className={cls} aria-label="Open run">
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

function CharsTokens({ chars }: { chars: number }) {
  if (!chars) return <span className="text-muted-foreground">—</span>
  // ~4 chars per token (OpenAI rule-of-thumb).
  const tokens = Math.ceil(chars / 4)
  return (
    <span title={`${chars.toLocaleString()} chars`}>
      ~{formatTokens(tokens)}
      <span className="text-muted-foreground"> tok</span>
    </span>
  )
}

function useSparkLookup(sparks: ToolSpark[]): (name: string) => ToolBucketPoint[] {
  const map = useMemo(() => new Map(sparks.map((s) => [s.name, s.buckets])), [sparks])
  return (name: string) => map.get(name) ?? []
}

export function ToolErrorTable({ rows, sparks = [] }: { rows: ToolErrorRow[]; sparks?: ToolSpark[] }) {
  const sparkFor = useSparkLookup(sparks)
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
              <TableHead className="w-24">Trend</TableHead>
              <TableHead className="w-20 text-right tabular-nums">Rate ▼</TableHead>
              <TableHead className="w-8" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {visible.map((row) => (
              <TableRow key={row.name}>
                <TableCell className="max-w-0 truncate font-mono text-xs" title={row.name}>
                  {row.name}
                </TableCell>
                <TableCell className="text-right tabular-nums">{row.errors}</TableCell>
                <TableCell className="text-right tabular-nums text-muted-foreground">{row.total}</TableCell>
                <TableCell>
                  <MiniBarChart data={sparkFor(row.name)} tone="destructive" />
                </TableCell>
                <TableCell className="text-right">
                  <Badge variant="destructive">{(row.errorRate * 100).toFixed(1)}%</Badge>
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

export function ToolPayloadTable({ rows, sparks = [] }: { rows: ToolPayloadRow[]; sparks?: ToolSpark[] }) {
  const sparkFor = useSparkLookup(sparks)
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
              <TableHead className="w-24">Trend</TableHead>
              <TableHead className="w-8" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {visible.map((row) => (
              <TableRow key={row.name}>
                <TableCell className="max-w-0 truncate font-mono text-xs" title={row.name}>
                  {row.name}
                </TableCell>
                <TableCell className="text-right tabular-nums text-muted-foreground">
                  <CharsTokens chars={row.avgChars} />
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  <CharsTokens chars={row.p95Chars} />
                </TableCell>
                <TableCell className="text-right tabular-nums text-muted-foreground">
                  <CharsTokens chars={row.maxChars} />
                </TableCell>
                <TableCell>
                  <MiniBarChart data={sparkFor(row.name)} tone="warning" />
                </TableCell>
                <TableCell>
                  <OpenLink traceId={row.sampleTraceId} />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </Expandable>
  )
}

export function LatencyTable({ rows, firstHeader }: { rows: LatencyRow[]; firstHeader: string }) {
  if (rows.length === 0) {
    return <SectionEmpty title="No spans" description="No matching spans in this window." />
  }
  return (
    <Expandable rows={rows}>
      {(visible) => (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{firstHeader}</TableHead>
              <TableHead className="w-16 text-right tabular-nums">p50</TableHead>
              <TableHead className="w-16 text-right tabular-nums">p90</TableHead>
              <TableHead className="w-16 text-right tabular-nums">p95 ▼</TableHead>
              <TableHead className="w-16 text-right tabular-nums">p99</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {visible.map((row) => (
              <TableRow key={row.name}>
                <TableCell className="max-w-0 truncate font-mono text-xs" title={row.name}>
                  {row.name}
                </TableCell>
                <TableCell className="text-right tabular-nums text-muted-foreground">
                  {formatDuration(row.p50Ms)}
                </TableCell>
                <TableCell className="text-right tabular-nums text-muted-foreground">
                  {formatDuration(row.p90Ms)}
                </TableCell>
                <TableCell className="text-right tabular-nums text-muted-foreground">
                  {formatDuration(row.p95Ms)}
                </TableCell>
                <TableCell className="text-right tabular-nums text-muted-foreground">
                  {formatDuration(row.p99Ms)}
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
  return (
    <Expandable rows={rows}>
      {(visible) => (
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
                <TableCell className="font-mono text-xs">{row.name}</TableCell>
                <TableCell className="text-muted-foreground">{row.namespace || 'unknown'}</TableCell>
                <TableCell className="tabular-nums text-muted-foreground">{formatAgo(row.firstSeenAtMs)}</TableCell>
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
                <TableCell className="tabular-nums text-muted-foreground">{formatAgo(row.firstSeenAtMs)}</TableCell>
                <TableCell className="tabular-nums text-muted-foreground">{formatAgo(row.lastSeenAtMs)}</TableCell>
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
