import { Link } from '@tanstack/react-router'
import type { ColumnDef } from '@tanstack/react-table'
import { Clock } from 'lucide-react'
import { DataTableColumnHeader } from '#/components/data-table-column-header'
import { KindBadge } from '#/components/kind-badge'
import { RelativeTime } from '#/components/relative-time'
import { Badge } from '#/components/ui/badge'
import { ScoreSummaryBadge } from '#/features/evaluation'
import { type ScoreSummary, scoreFlagFor, scoreFlagsFor } from '#/lib/eval/evaluation'
import { formatCost, formatDuration, formatTokens, metricTone, truncateId } from '#/lib/format'
import type { TraceSummary } from '#/lib/telemetry'

// Columns are built per-render so the score badge/filter can close over the
// trace→ScoreSummary map fetched alongside the list.
export function makeTraceColumns(scoreSummaries: Record<string, ScoreSummary> = {}): ColumnDef<TraceSummary>[] {
  return [
    {
      accessorKey: 'status',
      accessorFn: (s) => (s.hasError ? 'error' : 'ok'),
      header: () => null,
      cell: () => null,
      filterFn: (row, _id, value: string[]) =>
        Array.isArray(value) && value.includes(row.original.hasError ? 'error' : 'ok'),
      enableSorting: false,
      enableHiding: false,
    },
    {
      id: 'scoreFlag',
      accessorFn: (s) => scoreFlagFor(scoreSummaries[s.id]),
      header: () => null,
      cell: () => null,
      filterFn: (row, _id, value: string[]) => {
        if (!Array.isArray(value) || value.length === 0) return true
        const flags = scoreFlagsFor(scoreSummaries[row.original.id])
        return value.some((v) => (flags as string[]).includes(v))
      },
      enableSorting: false,
      enableHiding: false,
    },
    {
      id: 'category',
      accessorFn: (s) => s.category ?? 'orphan',
      header: () => null,
      cell: () => null,
      filterFn: (row, _id, value: string[]) => {
        if (!Array.isArray(value) || value.length === 0) return true
        return value.includes(row.original.category ?? 'orphan')
      },
      enableSorting: false,
      enableHiding: false,
    },
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
      filterFn: (row, _id, value) => {
        const q = String(value ?? '')
          .trim()
          .toLowerCase()
        if (!q) return true
        const s = row.original
        const haystack = [
          s.id,
          s.agent ?? '',
          s.rootOperation ?? '',
          s.serviceName ?? '',
          s.userId ?? '',
          s.userName ?? '',
        ]
          .join(' ')
          .toLowerCase()
        return haystack.includes(q)
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
    {
      accessorKey: 'totalTokens',
      header: ({ column }) => <DataTableColumnHeader column={column} title="Tokens" className="justify-end" />,
      cell: ({ row }) => (
        <div className={`text-right tabular-nums ${metricTone('tokens', row.original.totalTokens)}`}>
          {formatTokens(row.original.totalTokens)}
        </div>
      ),
    },
    {
      accessorKey: 'totalCostUsd',
      header: ({ column }) => <DataTableColumnHeader column={column} title="Cost" className="justify-end" />,
      cell: ({ row }) => {
        const value = row.original.totalCostUsd ?? 0
        return <div className={`text-right tabular-nums ${metricTone('cost', value)}`}>{formatCost(value)}</div>
      },
    },
    {
      id: 'duration',
      accessorFn: (s) => s.durationMs,
      header: ({ column }) => <DataTableColumnHeader column={column} title="Duration" className="justify-end" />,
      cell: ({ row }) => {
        const ms = row.original.durationMs
        return (
          <div className={`flex items-center justify-end gap-1 tabular-nums ${metricTone('duration', ms)}`}>
            <Clock className="size-3.5 opacity-80" />
            {formatDuration(ms)}
          </div>
        )
      },
    },
    {
      accessorKey: 'spanCount',
      header: ({ column }) => <DataTableColumnHeader column={column} title="Spans" className="justify-end" />,
      cell: ({ row }) => <div className="text-right tabular-nums">{row.original.spanCount}</div>,
    },
    {
      id: 'user',
      accessorFn: (s) => s.userId ?? s.userName ?? '',
      header: ({ column }) => <DataTableColumnHeader column={column} title="User" />,
      cell: ({ row }) => {
        const s = row.original
        const primary = s.userId ?? '—'
        const secondary = s.userName && s.userId ? s.userName : undefined
        return (
          <div className="flex min-w-0 items-center gap-1.5">
            <span className="min-w-0 max-w-[140px] truncate">{primary}</span>
            {secondary && (
              <span className="max-w-[120px] shrink-0 truncate text-xs text-muted-foreground">{secondary}</span>
            )}
          </div>
        )
      },
    },
  ]
}
