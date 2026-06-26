import { RelativeTime } from '#/components/relative-time'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '#/components/ui/table'
import { formatCost, formatPercent, shortId } from '#/lib/format'
import type { TraceSummary } from '#/lib/telemetry'
import { cn } from '#/lib/utils'

interface TaskCostProps {
  fires: TraceSummary[]
  onRowClick?: (row: TraceSummary) => void
}

export function TaskCost({ fires, onRowClick }: TaskCostProps) {
  const priced = fires.filter((f) => f.totalCostUsd != null)
  if (priced.length === 0) {
    return (
      <div className="px-4 py-12 text-sm text-muted-foreground lg:px-6">
        No cost data — these fires' spans don't carry token usage.
      </div>
    )
  }

  const total = priced.reduce((s, f) => s + (f.totalCostUsd ?? 0), 0)
  const avg = total / priced.length
  const sorted = [...priced].sort((a, b) => (b.totalCostUsd ?? 0) - (a.totalCostUsd ?? 0))

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <dl className="flex flex-wrap items-center gap-x-12 gap-y-4 border-b px-4 py-5 lg:px-6">
        <Stat label="Total" value={formatCost(total)} caption={`${priced.length} priced fires`} />
        <Stat label="Avg / fire" value={formatCost(avg)} />
        <Stat label="Most expensive" value={formatCost(sorted[0]?.totalCostUsd ?? 0)} />
      </dl>
      <div className="min-h-0 flex-1 overflow-y-auto">
        <Table>
          <TableHeader className="sticky top-0 z-10 bg-muted/40 [&_th]:font-normal [&_th]:text-muted-foreground">
            <TableRow className="[&>:first-child]:pl-4 [&>:last-child]:pr-4 lg:[&>:first-child]:pl-6 lg:[&>:last-child]:pr-6">
              <TableHead>When</TableHead>
              <TableHead className="text-right">Cost</TableHead>
              <TableHead className="text-right">Share</TableHead>
              <TableHead>Trace</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {sorted.map((f) => (
              <TableRow
                key={f.id}
                onClick={onRowClick ? () => onRowClick(f) : undefined}
                className={cn(
                  'h-11 [&>:first-child]:pl-4 [&>:last-child]:pr-4 lg:[&>:first-child]:pl-6 lg:[&>:last-child]:pr-6',
                  onRowClick && 'cursor-pointer',
                )}
              >
                <TableCell>
                  <RelativeTime ts={f.startedAtMs} className="whitespace-nowrap tabular-nums text-muted-foreground" />
                </TableCell>
                <TableCell className="text-right tabular-nums">{formatCost(f.totalCostUsd ?? 0)}</TableCell>
                <TableCell className="text-right tabular-nums text-muted-foreground">
                  {formatPercent(f.totalCostUsd ?? 0, total)}
                </TableCell>
                <TableCell>
                  <span className="font-mono text-[11px] text-muted-foreground">{shortId(f.id)}</span>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  )
}

function Stat({ label, value, caption }: { label: string; value: string; caption?: string }) {
  return (
    <div>
      <dt className="text-sm text-muted-foreground">{label}</dt>
      <dd className="mt-1.5 text-lg font-semibold tabular-nums text-foreground">
        {value}
        {caption && <span className="ml-2 text-sm font-medium text-muted-foreground">{caption}</span>}
      </dd>
    </div>
  )
}
