import type { ColumnDef } from '@tanstack/react-table'
import { StickyNote } from 'lucide-react'
import { DataTableColumnHeader } from '#/components/data-table-column-header'
import { RelativeTime } from '#/components/relative-time'
import {
  costColumn,
  durationColumn,
  scoreFlagColumn,
  statusFilterColumn,
  tokensColumn,
} from '#/components/table-columns'
import { Badge } from '#/components/ui/badge'
import { Tooltip, TooltipContent, TooltipTrigger } from '#/components/ui/tooltip'
import { ScoreSummaryBadge } from '#/features/evaluation'
import type { ScoreSummary } from '#/lib/eval/evaluation'
import { truncateId } from '#/lib/format'
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
    statusFilterColumn<SessionSummary>(),
    scoreFlagColumn<SessionSummary>((s) => s.sessionId, scoreSummaries),
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
    durationColumn<SessionSummary>((s) => s.activeDurationMs),
    tokensColumn<SessionSummary>(),
    costColumn<SessionSummary>(),
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
