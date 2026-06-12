import { Clock } from 'lucide-react'
import { RelativeTime } from '#/components/relative-time'
import { Badge } from '#/components/ui/badge'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '#/components/ui/table'
import { formatDuration, metricTone, shortId } from '#/lib/format'
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
          <TableHeader className="sticky top-0 z-10 bg-muted/40 [&_th]:font-normal [&_th]:text-muted-foreground [&_button]:font-normal [&_button]:text-muted-foreground">
            <TableRow className="[&>:first-child]:pl-4 [&>:last-child]:pr-4 lg:[&>:first-child]:pl-6 lg:[&>:last-child]:pr-6">
              <TableHead>When</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Duration</TableHead>
              <TableHead className="text-right">Spans</TableHead>
              <TableHead>Trace</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.map((fire) => (
              <TableRow
                key={fire.id}
                onClick={onRowClick ? () => onRowClick(fire) : undefined}
                className={cn(
                  'h-12 [&>:first-child]:pl-4 [&>:last-child]:pr-4 lg:[&>:first-child]:pl-6 lg:[&>:last-child]:pr-6',
                  onRowClick && 'cursor-pointer',
                )}
              >
                <TableCell>
                  <RelativeTime
                    ts={fire.startedAtMs}
                    className="whitespace-nowrap tabular-nums text-muted-foreground"
                  />
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
                    <Clock className="size-3.5 opacity-80" />
                    {formatDuration(fire.durationMs)}
                  </div>
                </TableCell>
                <TableCell className="text-right tabular-nums">{fire.spanCount}</TableCell>
                <TableCell>
                  <span className="font-mono text-[11px] text-muted-foreground">{shortId(fire.id)}</span>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  )
}
