import {
  Clock01Icon,
  Message01Icon,
  Notification03Icon,
  RepeatIcon,
  Robot01Icon,
  Unlink01Icon,
  WebhookIcon,
  Wrench01Icon,
} from '@hugeicons/core-free-icons'
import { HugeiconsIcon, type IconSvgElement } from '@hugeicons/react'
import { Link } from '@tanstack/react-router'
import type { ColumnDef } from '@tanstack/react-table'
import { DataTableColumnHeader } from '#/components/data-table-column-header'
import { Badge } from '#/components/ui/badge'
import { formatAgo, formatCost, formatDuration, formatTokens, metricTone, truncateId } from '#/lib/format'
import type { TraceCategory, TraceSummary } from '#/lib/telemetry'
import { cn } from '#/lib/utils'

const CATEGORY_LABELS: Record<TraceCategory, string> = {
  chat: 'Chat',
  'sub-agent': 'Sub-agent',
  scheduled: 'Scheduled',
  event: 'Event',
  webhook: 'Webhook',
  background: 'Background',
  utility: 'Utility',
  orphan: 'Orphan',
}

const CATEGORY_META: Record<TraceCategory, { icon: IconSvgElement; color: string }> = {
  chat: { icon: Message01Icon, color: 'text-blue-500 dark:text-blue-400' },
  'sub-agent': { icon: Robot01Icon, color: 'text-fuchsia-500 dark:text-fuchsia-400' },
  scheduled: { icon: Clock01Icon, color: 'text-amber-500 dark:text-amber-400' },
  event: { icon: Notification03Icon, color: 'text-orange-500 dark:text-orange-400' },
  webhook: { icon: WebhookIcon, color: 'text-cyan-500 dark:text-cyan-400' },
  background: { icon: RepeatIcon, color: 'text-violet-500 dark:text-violet-400' },
  utility: { icon: Wrench01Icon, color: 'text-teal-500 dark:text-teal-400' },
  orphan: { icon: Unlink01Icon, color: 'text-zinc-400 dark:text-zinc-500' },
}

export const traceColumns: ColumnDef<TraceSummary>[] = [
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
      <time
        dateTime={new Date(row.original.startedAtMs).toISOString()}
        title={new Date(row.original.startedAtMs).toLocaleString()}
        className="whitespace-nowrap tabular-nums text-muted-foreground"
      >
        {formatAgo(row.original.startedAtMs)}
      </time>
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
          <Badge variant="outline" className="px-1.5 text-muted-foreground">
            <HugeiconsIcon
              icon={CATEGORY_META[cat].icon}
              strokeWidth={1.5}
              className={cn('size-3', CATEGORY_META[cat].color)}
              aria-hidden
            />
            {CATEGORY_LABELS[cat]}
          </Badge>
          {llmPurpose && (
            <Badge variant="outline" className="whitespace-nowrap font-mono text-[10px]" title={llmPurpose}>
              {llmPurpose}
            </Badge>
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
    accessorKey: 'totalTokens',
    header: ({ column }) => <DataTableColumnHeader column={column} title="Tokens" className="justify-end" />,
    cell: ({ row }) => <div className="text-right tabular-nums">{formatTokens(row.original.totalTokens)}</div>,
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
          <HugeiconsIcon icon={Clock01Icon} strokeWidth={2} className="size-3.5 opacity-80" />
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
