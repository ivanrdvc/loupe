import { Edit01Icon, Note01Icon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import type { ColumnDef } from '@tanstack/react-table'
import { Button } from '#/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '#/components/ui/popover'
import { Textarea } from '#/components/ui/textarea'
import { useSessionNote } from '#/hooks/use-session-note'
import { formatAgo, formatCost, formatTokens, metricTone, truncateId } from '#/lib/format'
import type { SessionSummary } from '#/lib/telemetry'
import { cn } from '#/lib/utils'
import { DataTableColumnHeader } from './data-table-column-header'

interface ColumnMeta {
  label?: string
}

type SessionColumn = ColumnDef<SessionSummary, unknown> & { meta?: ColumnMeta }

function userPrimary(s: SessionSummary): string {
  return s.userName ?? s.userId ?? s.host ?? '—'
}

function userSecondary(s: SessionSummary): string | undefined {
  if (s.userName) return s.userId ?? s.host
  if (s.userId) return s.host
  return undefined
}

function StatusDot({ hasError }: { hasError: boolean }) {
  return (
    <span
      aria-hidden
      title={hasError ? 'Error' : 'OK'}
      className={cn('inline-block size-1.5 shrink-0 rounded-full', hasError ? 'bg-destructive' : 'bg-emerald-500')}
    />
  )
}

function NoteCell({ sessionId }: { sessionId: string }) {
  const note = useSessionNote(sessionId)
  const has = note.body.length > 0
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={(event) => event.stopPropagation()}
          className={cn(!has && 'text-muted-foreground/50 opacity-0 group-hover/row:opacity-100')}
          aria-label={has ? 'Edit note' : 'Add note'}
        >
          <HugeiconsIcon icon={has ? Note01Icon : Edit01Icon} />
        </Button>
      </PopoverTrigger>
      <PopoverContent side="left" align="start" className="w-72 space-y-2" onClick={(event) => event.stopPropagation()}>
        <div className="space-y-1">
          <p className="text-xs font-medium">Note</p>
          <p className="text-[11px] text-muted-foreground">
            Saved in your browser. Use this for ad-hoc tags or follow-up reminders.
          </p>
        </div>
        <Textarea
          rows={4}
          placeholder="e.g. follow up about model regression"
          value={note.body}
          onChange={(event) => note.setBody(event.target.value)}
        />
        {note.updatedAt ? (
          <p className="text-[11px] text-muted-foreground">Updated {formatAgo(note.updatedAt)}</p>
        ) : null}
      </PopoverContent>
    </Popover>
  )
}

export const sessionColumns: SessionColumn[] = [
  {
    accessorKey: 'status',
    accessorFn: (s) => (s.hasError ? 'error' : 'ok'),
    header: ({ column }) => <DataTableColumnHeader column={column} title="" />,
    cell: ({ row }) => <StatusDot hasError={!!row.original.hasError} />,
    filterFn: (row, _id, value) => Array.isArray(value) && value.includes(row.original.hasError ? 'error' : 'ok'),
    enableSorting: false,
    meta: { label: 'Status' },
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
    meta: { label: 'Last seen' },
  },
  {
    accessorKey: 'sessionId',
    header: ({ column }) => <DataTableColumnHeader column={column} title="Session" />,
    cell: ({ row }) => {
      const s = row.original
      const title = s.title?.trim()
      const idLabel = truncateId(s.sessionId)
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
          {s.source === 'agent-instance' && (
            <span
              title="Derived from agent-instance hex (no session.id attribute)"
              className="shrink-0 rounded bg-amber-500/10 px-1 py-0.5 font-mono text-[10px] text-amber-700 dark:text-amber-300"
            >
              heuristic
            </span>
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
    meta: { label: 'Session' },
  },
  {
    accessorKey: 'firstInput',
    header: 'Input',
    cell: ({ row }) => {
      const firstInput = row.original.firstInput?.trim()
      return firstInput ? (
        <span className="block max-w-[420px] truncate text-foreground/80" title={firstInput}>
          {firstInput}
        </span>
      ) : (
        <span className="text-muted-foreground/60">—</span>
      )
    },
    enableSorting: false,
    meta: { label: 'Input' },
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
          <span className="min-w-0 max-w-[160px] truncate text-foreground">{primary}</span>
          {secondary ? (
            <span className="max-w-[160px] shrink-0 truncate text-xs text-muted-foreground">{secondary}</span>
          ) : null}
        </div>
      )
    },
    meta: { label: 'User' },
  },
  {
    accessorKey: 'totalTokens',
    header: ({ column }) => <DataTableColumnHeader column={column} title="Tokens" className="justify-end" />,
    cell: ({ row }) => (
      <div className={cn('text-right font-medium tabular-nums', metricTone('tokens', row.original.totalTokens))}>
        {formatTokens(row.original.totalTokens)}
      </div>
    ),
    meta: { label: 'Tokens' },
  },
  {
    accessorKey: 'totalCostUsd',
    header: ({ column }) => <DataTableColumnHeader column={column} title="Cost" className="justify-end" />,
    cell: ({ row }) => (
      <div className={cn('text-right font-medium tabular-nums', metricTone('cost', row.original.totalCostUsd))}>
        {formatCost(row.original.totalCostUsd ?? 0)}
      </div>
    ),
    meta: { label: 'Cost' },
  },
  {
    accessorKey: 'traceCount',
    header: ({ column }) => <DataTableColumnHeader column={column} title="Turns" className="justify-end" />,
    cell: ({ row }) => <div className="text-right tabular-nums text-muted-foreground">{row.original.traceCount}</div>,
    meta: { label: 'Turns' },
  },
  {
    id: 'agents',
    accessorFn: (s) => s.agents.join(', '),
    header: 'Agents',
    cell: ({ row }) => (
      <span className="block max-w-[200px] truncate text-foreground/80" title={row.original.agents.join(', ')}>
        {row.original.agents.join(', ') || '—'}
      </span>
    ),
    enableSorting: false,
    meta: { label: 'Agents' },
  },
  {
    accessorKey: 'startedAtMs',
    header: ({ column }) => <DataTableColumnHeader column={column} title="Started" />,
    cell: ({ row }) => (
      <time
        dateTime={new Date(row.original.startedAtMs).toISOString()}
        title={new Date(row.original.startedAtMs).toLocaleString()}
        className="whitespace-nowrap tabular-nums text-muted-foreground"
      >
        {formatAgo(row.original.startedAtMs)}
      </time>
    ),
    meta: { label: 'Started' },
  },
  {
    accessorKey: 'source',
    header: 'Source',
    cell: ({ row }) => <span className="text-muted-foreground">{row.original.source}</span>,
    enableSorting: false,
    meta: { label: 'Source' },
  },
  {
    id: 'note',
    header: '',
    cell: ({ row }) => (
      <div className="flex justify-end">
        <NoteCell sessionId={row.original.sessionId} />
      </div>
    ),
    enableSorting: false,
    enableHiding: false,
  },
]

export const DEFAULT_VISIBLE: Record<string, boolean> = {
  startedAtMs: false,
  agents: false,
  source: false,
}
