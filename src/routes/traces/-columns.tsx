import { Link } from '@tanstack/react-router'
import type { ColumnDef } from '@tanstack/react-table'
import { DataTableColumnHeader } from '#/components/data-table-column-header'
import { KindBadge } from '#/components/kind-badge'
import { RelativeTime } from '#/components/relative-time'
import {
  costColumn,
  durationColumn,
  scoreFlagColumn,
  statusFilterColumn,
  tokensColumn,
  userColumn,
} from '#/components/table-columns'
import { Badge } from '#/components/ui/badge'
import { ScoreSummaryBadge } from '#/features/evaluation'
import type { ScoreSummary } from '#/lib/eval/evaluation'
import { truncateId } from '#/lib/format'
import type { TraceSummary } from '#/lib/telemetry'

// Columns are built per-render so the score badge/filter can close over the
// trace→ScoreSummary map fetched alongside the list.
export function makeTraceColumns(scoreSummaries: Record<string, ScoreSummary> = {}): ColumnDef<TraceSummary>[] {
  return [
    statusFilterColumn<TraceSummary>(),
    scoreFlagColumn<TraceSummary>((s) => s.id, scoreSummaries),
    {
      accessorKey: 'startedAtMs',
      header: ({ column }) => <DataTableColumnHeader column={column} title="Last seen" />,
      cell: ({ row }) => (
        <RelativeTime ts={row.original.startedAtMs} className="whitespace-nowrap tabular-nums text-muted-foreground" />
      ),
    },
    {
      accessorKey: 'id',
      header: ({ column }) => <DataTableColumnHeader column={column} title="Trace" />,
      cell: ({ row }) => {
        const s = row.original
        return (
          <div className="flex min-w-0 items-center gap-1.5">
            <span className="font-mono text-[11px]">{truncateId(s.id)}</span>
            {s.hasError && (
              <Badge variant="destructive" className="shrink-0 px-1.5">
                Error
              </Badge>
            )}
          </div>
        )
      },
    },
    {
      id: 'classificationBadges',
      header: ({ column }) => <DataTableColumnHeader column={column} title="Category" />,
      cell: ({ row }) => {
        const cat = row.original.category ?? 'orphan'
        const { llmPurpose, sessionId } = row.original
        return (
          <div className="flex items-center gap-1.5">
            <KindBadge kind={cat} />
            {llmPurpose && (
              <span
                className="whitespace-nowrap rounded bg-muted px-1.5 py-0.5 font-mono text-[10px] font-medium text-muted-foreground"
                title={llmPurpose}
              >
                {llmPurpose}
              </span>
            )}
            {cat === 'chat' && sessionId && (
              <Link
                to="/sessions/$sessionId"
                params={{ sessionId }}
                search={{ range: 7, view: 'conversation' }}
                className="text-[11px] hover:underline"
                onClick={(e) => e.stopPropagation()}
              >
                →session
              </Link>
            )}
          </div>
        )
      },
      enableSorting: false,
    },
    {
      accessorKey: 'agent',
      header: ({ column }) => <DataTableColumnHeader column={column} title="Agent" />,
      cell: ({ row }) => {
        const agent = row.original.agent
        return agent ? (
          <span className="block max-w-[240px] truncate" title={agent}>
            {agent}
          </span>
        ) : (
          <span className="text-muted-foreground/60">—</span>
        )
      },
      enableSorting: false,
    },
    {
      id: 'scores',
      header: ({ column }) => <DataTableColumnHeader column={column} title="Scores" />,
      cell: ({ row }) => {
        const summary = scoreSummaries[row.original.id]
        return summary ? <ScoreSummaryBadge summary={summary} /> : <span className="text-muted-foreground/40">—</span>
      },
      enableSorting: false,
    },
    tokensColumn<TraceSummary>(),
    costColumn<TraceSummary>(),
    durationColumn<TraceSummary>((s) => s.durationMs),
    {
      accessorKey: 'spanCount',
      header: ({ column }) => <DataTableColumnHeader column={column} title="Spans" className="justify-end" />,
      cell: ({ row }) => <div className="text-right tabular-nums">{row.original.spanCount}</div>,
    },
    userColumn<TraceSummary>(),
  ]
}
