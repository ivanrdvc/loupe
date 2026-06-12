import type { ColumnDef } from '@tanstack/react-table'
import { Clock, StickyNote } from 'lucide-react'
import { DataTableColumnHeader } from '#/components/data-table-column-header'
import { RelativeTime } from '#/components/relative-time'
import { Badge } from '#/components/ui/badge'
import { Tooltip, TooltipContent, TooltipTrigger } from '#/components/ui/tooltip'
import { ScoreSummaryBadge } from '#/features/evaluation'
import { type ScoreSummary, scoreFlagFor, scoreFlagsFor } from '#/lib/eval/evaluation'
import { formatCost, formatDuration, formatTokens, metricTone, truncateId } from '#/lib/format'
import type { SessionSummary } from '#/lib/telemetry'

function userPrimary(s: SessionSummary): string {
  return s.userName ?? s.userId ?? '—'
}

function userSecondary(s: SessionSummary): string | undefined {
  if (s.userName) return s.userId
  return undefined
}

function SessionIdCell({ session, hasNote }: { session: SessionSummary; hasNote: boolean }) {
  const title = session.title?.trim()
  const idLabel = truncateId(session.sessionId)
  return (
    <div className="flex min-w-0 items-center gap-1.5">
      {title ? (
        <>
          <span className="min-w-0 max-w-[240px] truncate font-medium text-foreground" title={title}>
            {title}
          </span>
          <span className="shrink-0 font-mono text-[11px]">{idLabel}</span>
        </>
      ) : (
        <span className="font-mono text-[11px]">{idLabel}</span>
      )}
      {hasNote ? (
        <Tooltip>
          <TooltipTrigger asChild>
            <span className="inline-flex shrink-0 items-center text-muted-foreground">
              <StickyNote className="size-3.5" />
            </span>
          </TooltipTrigger>
          <TooltipContent>Has a note.</TooltipContent>
        </Tooltip>
      ) : null}
      {session.hasError ? (
        <Badge variant="destructive" className="shrink-0 px-1.5">
          Error
        </Badge>
      ) : null}
    </div>
  )
}

export function buildSessionColumns(
  noteFlags: Record<string, boolean>,
  scoreSummaries: Record<string, ScoreSummary> = {},
): ColumnDef<SessionSummary>[] {
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
      accessorFn: (s) => scoreFlagFor(scoreSummaries[s.sessionId]),
      header: () => null,
      cell: () => null,
      filterFn: (row, _id, value: string[]) => {
        if (!Array.isArray(value) || value.length === 0) return true
        const flags = scoreFlagsFor(scoreSummaries[row.original.sessionId])
        return value.some((v) => (flags as string[]).includes(v))
      },
      enableSorting: false,
      enableHiding: false,
    },
    {
      accessorKey: 'lastSeenMs',
      header: ({ column }) => <DataTableColumnHeader column={column} title="Last seen" />,
      cell: ({ row }) => (
        <RelativeTime ts={row.original.lastSeenMs} className="whitespace-nowrap tabular-nums text-muted-foreground" />
      ),
    },
    {
      accessorKey: 'sessionId',
      header: ({ column }) => <DataTableColumnHeader column={column} title="Session" />,
      cell: ({ row }) => <SessionIdCell session={row.original} hasNote={Boolean(noteFlags[row.original.sessionId])} />,
      filterFn: (row, _id, value) => {
        const q = String(value ?? '')
          .trim()
          .toLowerCase()
        if (!q) return true
        const s = row.original
        const haystack = [
          s.sessionId,
          s.title ?? '',
          s.userName ?? '',
          s.userId ?? '',
          s.host ?? '',
          s.agents.join(' '),
          s.firstInput ?? '',
        ]
          .join(' ')
          .toLowerCase()
        return haystack.includes(q)
      },
    },
    {
      accessorKey: 'firstInput',
      header: 'Input',
      cell: ({ row }) => {
        const firstInput = row.original.firstInput?.trim()
        return firstInput ? (
          <span className="block max-w-[420px] truncate" title={firstInput}>
            {firstInput}
          </span>
        ) : (
          <span className="text-muted-foreground/60">—</span>
        )
      },
      enableSorting: false,
    },
    {
      id: 'user',
      accessorFn: (s) => userPrimary(s),
      header: ({ column }) => <DataTableColumnHeader column={column} title="User" />,
      cell: ({ row }) => {
        const primary = userPrimary(row.original)
        const secondary = userSecondary(row.original)
        return (
          <div className="flex min-w-0 items-center gap-1.5">
            <span className="min-w-0 max-w-[160px] truncate">{primary}</span>
            {secondary ? (
              <span className="max-w-[160px] shrink-0 truncate text-xs text-muted-foreground">{secondary}</span>
            ) : null}
          </div>
        )
      },
    },
    {
      id: 'duration',
      accessorFn: (s) => s.activeDurationMs,
      header: ({ column }) => <DataTableColumnHeader column={column} title="Duration" className="justify-end" />,
      cell: ({ row }) => {
        const ms = row.original.activeDurationMs
        return (
          <div className={`flex items-center justify-end gap-1 tabular-nums ${metricTone('duration', ms)}`}>
            <Clock className="size-3.5 opacity-80" />
            {formatDuration(ms)}
          </div>
        )
      },
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
      accessorKey: 'traceCount',
      header: ({ column }) => <DataTableColumnHeader column={column} title="Traces" className="justify-end" />,
      cell: ({ row }) => <div className="text-right tabular-nums">{row.original.traceCount}</div>,
    },
    {
      id: 'scores',
      header: ({ column }) => <DataTableColumnHeader column={column} title="Scores" />,
      cell: ({ row }) => {
        const summary = scoreSummaries[row.original.sessionId]
        return summary ? <ScoreSummaryBadge summary={summary} /> : <span className="text-muted-foreground/40">—</span>
      },
      enableSorting: false,
    },
  ]
}
