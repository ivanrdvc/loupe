import { Clock01Icon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { Link } from '@tanstack/react-router'
import type { ColumnDef } from '@tanstack/react-table'
import { DataTableColumnHeader } from '#/components/data-table-column-header'
import { Badge } from '#/components/ui/badge'
import { formatAgo, formatCost, formatDuration, formatTokens, metricTone, truncateId } from '#/lib/format'
import type { SpanSummary } from '#/lib/telemetry'

export const spanColumns: ColumnDef<SpanSummary>[] = [
  {
    accessorKey: 'startedAtMs',
    header: ({ column }) => <DataTableColumnHeader column={column} title="When" />,
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
    accessorKey: 'spanName',
    header: ({ column }) => <DataTableColumnHeader column={column} title="Span" />,
    cell: ({ row }) => {
      const s = row.original
      return (
        <div className="flex min-w-0 items-center gap-1.5">
          <span className="block max-w-[260px] truncate" title={s.spanName}>
            {s.spanName}
          </span>
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
      const haystack = [s.spanId, s.traceId, s.spanName, s.label, s.modelId ?? '', s.userId ?? '', s.userName ?? '']
        .join(' ')
        .toLowerCase()
      return haystack.includes(q)
    },
  },
  {
    accessorKey: 'kind',
    header: ({ column }) => <DataTableColumnHeader column={column} title="Kind" />,
    cell: ({ row }) => (
      <Badge variant="outline" className="px-1.5 capitalize text-muted-foreground">
        {row.original.kind}
      </Badge>
    ),
    filterFn: (row, _id, value: string[]) => {
      if (!Array.isArray(value) || value.length === 0) return true
      return value.includes(row.original.kind)
    },
    enableSorting: false,
  },
  {
    accessorKey: 'label',
    header: ({ column }) => <DataTableColumnHeader column={column} title="Label" />,
    cell: ({ row }) =>
      row.original.label ? (
        <Badge variant="outline" className="whitespace-nowrap font-mono text-[10px]" title={row.original.label}>
          {row.original.label}
        </Badge>
      ) : (
        <span className="text-muted-foreground/60">—</span>
      ),
    enableSorting: false,
  },
  {
    accessorKey: 'modelId',
    header: ({ column }) => <DataTableColumnHeader column={column} title="Model" />,
    cell: ({ row }) => {
      const m = row.original.modelId
      return m ? (
        <span className="font-mono text-[11px]">{m}</span>
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
    id: 'trace',
    header: ({ column }) => <DataTableColumnHeader column={column} title="Trace" />,
    cell: ({ row }) => (
      <Link
        to="/traces/$traceId"
        params={{ traceId: row.original.traceId }}
        className="font-mono text-[11px] hover:underline"
        onClick={(e) => e.stopPropagation()}
      >
        {truncateId(row.original.traceId)}
      </Link>
    ),
    enableSorting: false,
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
