import { Clock01Icon, StickyNote01Icon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { useQuery } from '@tanstack/react-query'
import type { ColumnDef } from '@tanstack/react-table'
import { DataTableColumnHeader } from '#/components/data-table-column-header'
import { Badge } from '#/components/ui/badge'
import { Tooltip, TooltipContent, TooltipTrigger } from '#/components/ui/tooltip'
import { formatAgo, formatCost, formatDuration, formatTokens, metricTone, truncateId } from '#/lib/format'
import { queryKeys } from '#/lib/query-keys'
import type { SessionSummary } from '#/lib/telemetry'
import { getNoteFlagsForKind } from '#/server/notes'

function userPrimary(s: SessionSummary): string {
  return s.userName ?? s.userId ?? '—'
}

function userSecondary(s: SessionSummary): string | undefined {
  if (s.userName) return s.userId
  return undefined
}

function SessionIdCell({ session }: { session: SessionSummary }) {
  const title = session.title?.trim()
  const idLabel = truncateId(session.sessionId)
  const { data: flags } = useQuery({
    queryKey: queryKeys.notes.flagsForKind('session'),
    queryFn: () => getNoteFlagsForKind({ data: 'session' }),
  })
  const hasNote = Boolean(flags?.[session.sessionId])
  return (
    <div className="flex min-w-0 items-center gap-1.5">
      {title ? (
        <>
          <span className="min-w-0 max-w-[240px] truncate font-medium text-foreground" title={title}>
            {title}
          </span>
          <span className="shrink-0 font-mono text-[11px] text-muted-foreground">{idLabel}</span>
        </>
      ) : (
        <span className="font-mono text-[11px] text-muted-foreground">{idLabel}</span>
      )}
      {hasNote ? (
        <Tooltip>
          <TooltipTrigger asChild>
            <span className="inline-flex shrink-0 items-center text-muted-foreground">
              <HugeiconsIcon icon={StickyNote01Icon} strokeWidth={2} className="size-3.5" />
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

export const sessionColumns: ColumnDef<SessionSummary>[] = [
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
    accessorKey: 'lastSeenMs',
    header: ({ column }) => <DataTableColumnHeader column={column} title="Last seen" />,
    cell: ({ row }) => (
      <time
        dateTime={new Date(row.original.lastSeenMs).toISOString()}
        title={new Date(row.original.lastSeenMs).toLocaleString()}
        className="whitespace-nowrap tabular-nums text-muted-foreground"
      >
        {formatAgo(row.original.lastSeenMs)}
      </time>
    ),
  },
  {
    accessorKey: 'sessionId',
    header: ({ column }) => <DataTableColumnHeader column={column} title="Session" />,
    cell: ({ row }) => <SessionIdCell session={row.original} />,
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
        <span className="block max-w-[420px] truncate text-muted-foreground" title={firstInput}>
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
          <span className="min-w-0 max-w-[160px] truncate text-muted-foreground">{primary}</span>
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
        <div
          className={`flex items-center justify-end gap-1 tabular-nums ${metricTone('duration', ms, 'text-muted-foreground')}`}
        >
          <HugeiconsIcon icon={Clock01Icon} strokeWidth={2} className="size-3.5 opacity-80" />
          {formatDuration(ms)}
        </div>
      )
    },
  },
  {
    accessorKey: 'totalTokens',
    header: ({ column }) => <DataTableColumnHeader column={column} title="Tokens" className="justify-end" />,
    cell: ({ row }) => (
      <div className="text-right tabular-nums text-muted-foreground">{formatTokens(row.original.totalTokens)}</div>
    ),
  },
  {
    accessorKey: 'totalCostUsd',
    header: ({ column }) => <DataTableColumnHeader column={column} title="Cost" className="justify-end" />,
    cell: ({ row }) => {
      const value = row.original.totalCostUsd ?? 0
      return (
        <div className={`text-right tabular-nums ${metricTone('cost', value, 'text-muted-foreground')}`}>
          {formatCost(value)}
        </div>
      )
    },
  },
  {
    accessorKey: 'traceCount',
    header: ({ column }) => <DataTableColumnHeader column={column} title="Traces" className="justify-end" />,
    cell: ({ row }) => <div className="text-right tabular-nums text-muted-foreground">{row.original.traceCount}</div>,
  },
]
