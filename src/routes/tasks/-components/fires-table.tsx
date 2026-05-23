import { Clock01Icon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { Badge } from '#/components/ui/badge'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '#/components/ui/table'
import { formatAgo, formatDuration, metricTone, shortId } from '#/lib/format'
import type { TraceSummary } from '#/lib/telemetry'
import { cn } from '#/lib/utils'

interface FiresTableProps {
  data: TraceSummary[]
  onRowClick?: (row: TraceSummary) => void
}

export function FiresTable({ data, onRowClick }: FiresTableProps) {
  return (
    <div className="flex min-h-0 flex-1 flex-col border-t">
      <div className="min-h-0 flex-1 overflow-hidden overflow-y-auto bg-background">
        <Table>
          <TableHeader className="sticky top-0 z-10 bg-muted">
            <TableRow className="[&>:first-child]:pl-4 [&>:last-child]:pr-4 lg:[&>:first-child]:pl-6 lg:[&>:last-child]:pr-6">
              <TableHead>When</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Duration</TableHead>
              <TableHead className="text-right">Spans</TableHead>
              <TableHead>Trace</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.length === 0 ? (
              <TableRow className="hover:bg-transparent">
                <TableCell colSpan={5} className="h-32 text-center text-sm text-muted-foreground">
                  No fires.
                </TableCell>
              </TableRow>
            ) : (
              data.map((fire) => (
                <TableRow
                  key={fire.id}
                  onClick={onRowClick ? () => onRowClick(fire) : undefined}
                  className={cn(
                    'h-12 [&>:first-child]:pl-4 [&>:last-child]:pr-4 lg:[&>:first-child]:pl-6 lg:[&>:last-child]:pr-6',
                    onRowClick && 'cursor-pointer',
                  )}
                >
                  <TableCell>
                    <time
                      dateTime={new Date(fire.startedAtMs).toISOString()}
                      title={new Date(fire.startedAtMs).toLocaleString()}
                      className="whitespace-nowrap tabular-nums text-muted-foreground"
                    >
                      {formatAgo(fire.startedAtMs)}
                    </time>
                  </TableCell>
                  <TableCell>
                    {fire.hasError ? (
                      <Badge variant="destructive" className="px-1.5">
                        Error
                      </Badge>
                    ) : (
                      <span className="text-sm text-muted-foreground">OK</span>
                    )}
                  </TableCell>
                  <TableCell>
                    <div
                      className={cn(
                        'flex items-center justify-end gap-1 tabular-nums',
                        metricTone('duration', fire.durationMs),
                      )}
                    >
                      <HugeiconsIcon icon={Clock01Icon} strokeWidth={2} className="size-3.5 opacity-80" />
                      {formatDuration(fire.durationMs)}
                    </div>
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{fire.spanCount}</TableCell>
                  <TableCell>
                    <span className="font-mono text-[11px] text-muted-foreground">{shortId(fire.id)}</span>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  )
}
