import { HugeiconsIcon } from '@hugeicons/react'
import { Link } from '@tanstack/react-router'
import type { ColumnDef } from '@tanstack/react-table'
import { Area, AreaChart } from 'recharts'
import { DataTableColumnHeader } from '#/components/data-table-column-header'
import { RelativeTime } from '#/components/relative-time'
import { Badge } from '#/components/ui/badge'
import { KIND_META } from '#/features/tasks/kind-meta'
import type { TaskRow } from '#/features/tasks/rollup'
import { formatDuration, formatPercent, metricTone } from '#/lib/format'
import { cn } from '#/lib/utils'

export const taskColumns: ColumnDef<TaskRow>[] = [
  {
    accessorKey: 'status',
    accessorFn: (r) => (r.errored > 0 ? 'error' : 'ok'),
    header: () => null,
    cell: () => null,
    filterFn: (row, _id, value: string[]) =>
      Array.isArray(value) && value.includes(row.original.errored > 0 ? 'error' : 'ok'),
    enableSorting: false,
    enableHiding: false,
  },
  {
    id: 'kind',
    accessorFn: (r) => r.kind,
    header: ({ column }) => <DataTableColumnHeader column={column} title="Kind" />,
    cell: ({ row }) => {
      const meta = KIND_META[row.original.kind]
      return (
        <Badge variant="outline" className="px-1.5 text-muted-foreground">
          <HugeiconsIcon icon={meta.icon} strokeWidth={1.5} className={cn('size-3', meta.color)} aria-hidden />
          {meta.label}
        </Badge>
      )
    },
    filterFn: (row, _id, value: string[]) => {
      if (!Array.isArray(value) || value.length === 0) return true
      return value.includes(row.original.kind)
    },
    enableSorting: false,
  },
  {
    id: 'name',
    accessorFn: (r) => r.name ?? r.taskId ?? r.key,
    header: ({ column }) => <DataTableColumnHeader column={column} title="Name" />,
    cell: ({ row }) => {
      const r = row.original
      const isId = !r.name && (r.taskId || r.identitySource !== 'task.id')
      const label = r.name ?? r.taskId ?? deriveLabel(r.key)
      return (
        <div className="flex min-w-0 items-center gap-1.5">
          <span className={cn('block max-w-[260px] truncate', isId && 'font-mono text-[12px]')} title={label}>
            {label}
          </span>
          {r.identitySource === 'derived' && (
            <Badge
              variant="outline"
              className="shrink-0 px-1.5 text-[10px] text-muted-foreground"
              title="No task.id on the root span — grouped by service+agent+trigger"
            >
              derived
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
      const r = row.original
      const haystack = [
        r.name ?? '',
        r.taskId ?? '',
        r.schedule ?? '',
        r.source ?? '',
        r.agent ?? '',
        r.serviceName ?? '',
      ]
        .join(' ')
        .toLowerCase()
      return haystack.includes(q)
    },
  },
  {
    id: 'trigger',
    accessorFn: (r) => r.schedule ?? r.source ?? '',
    header: ({ column }) => <DataTableColumnHeader column={column} title="Trigger" />,
    cell: ({ row }) => {
      const value = row.original.schedule ?? row.original.source
      if (!value) return <span className="text-muted-foreground/60">—</span>
      return (
        <span className="block max-w-[180px] truncate font-mono text-[11px]" title={value}>
          {value}
        </span>
      )
    },
    enableSorting: false,
  },
  {
    accessorKey: 'agent',
    header: ({ column }) => <DataTableColumnHeader column={column} title="Agent" />,
    cell: ({ row }) => {
      const agent = row.original.agent ?? row.original.serviceName
      return agent ? (
        <span className="block max-w-[200px] truncate" title={agent}>
          {agent}
        </span>
      ) : (
        <span className="text-muted-foreground/60">—</span>
      )
    },
    enableSorting: false,
  },
  {
    accessorKey: 'fires',
    header: ({ column }) => <DataTableColumnHeader column={column} title="Fires" className="justify-end" />,
    cell: ({ row }) => {
      const r = row.original
      return (
        <div className="flex items-center justify-end gap-2">
          <AreaChart width={56} height={24} data={r.spark} className="shrink-0">
            <defs>
              <linearGradient id={`spark-${r.key}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="currentColor" stopOpacity={0.35} />
                <stop offset="100%" stopColor="currentColor" stopOpacity={0} />
              </linearGradient>
            </defs>
            <Area
              type="monotone"
              dataKey="fires"
              stroke="currentColor"
              strokeWidth={1.2}
              fill={`url(#spark-${r.key})`}
              isAnimationActive={false}
            />
          </AreaChart>
          <span className="tabular-nums">{r.fires.toLocaleString()}</span>
        </div>
      )
    },
  },
  {
    id: 'success',
    accessorFn: (r) => r.successRate,
    header: ({ column }) => <DataTableColumnHeader column={column} title="Success" className="justify-end" />,
    cell: ({ row }) => {
      const r = row.original
      const errRate = 1 - r.successRate
      const tone =
        errRate >= 0.1
          ? 'text-rose-700 dark:text-rose-300'
          : errRate >= 0.02
            ? 'text-amber-700 dark:text-amber-300'
            : ''
      return <div className={cn('text-right tabular-nums', tone)}>{formatPercent(r.fires - r.errored, r.fires)}</div>
    },
  },
  {
    id: 'avgDuration',
    accessorFn: (r) => r.avgDurationMs,
    header: ({ column }) => <DataTableColumnHeader column={column} title="Avg dur" className="justify-end" />,
    cell: ({ row }) => {
      const ms = row.original.avgDurationMs
      return <div className={cn('text-right tabular-nums', metricTone('duration', ms))}>{formatDuration(ms)}</div>
    },
  },
  {
    accessorKey: 'lastFireMs',
    header: ({ column }) => <DataTableColumnHeader column={column} title="Last fire" />,
    cell: ({ row }) => (
      <RelativeTime ts={row.original.lastFireMs} className="whitespace-nowrap tabular-nums text-muted-foreground" />
    ),
  },
  {
    id: 'createdBy',
    accessorFn: (r) => r.conversationId ?? '',
    header: ({ column }) => <DataTableColumnHeader column={column} title="Created by" />,
    cell: ({ row }) => {
      const sessionId = row.original.conversationId
      if (!sessionId) return <span className="text-muted-foreground/60">—</span>
      return (
        <Link
          to="/sessions/$sessionId"
          params={{ sessionId }}
          search={{ range: 7, view: 'conversation' }}
          className="font-mono text-[11px] text-muted-foreground hover:underline"
          onClick={(e) => e.stopPropagation()}
          title={sessionId}
        >
          →chat
        </Link>
      )
    },
    enableSorting: false,
  },
]

function deriveLabel(key: string): string {
  const [, rest] = key.split(':', 2)
  if (!rest) return key
  const parts = rest.split('|').filter(Boolean)
  return parts.slice(-2).join(' · ') || rest
}
