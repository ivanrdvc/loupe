import type { ColumnDef } from '@tanstack/react-table'
import { Clock } from 'lucide-react'
import { DataTableColumnHeader } from '#/components/data-table-column-header'
import { type ScoreSummary, scoreFlagFor, scoreFlagsFor } from '#/lib/eval/evaluation'
import { formatCost, formatDuration, formatTokens, metricTone } from '#/lib/format'

// Column builders shared by the sessions/traces/spans list tables.

export function tokensColumn<T extends { totalTokens?: number }>(): ColumnDef<T> {
  return {
    id: 'totalTokens',
    accessorFn: (s) => s.totalTokens,
    header: ({ column }) => <DataTableColumnHeader column={column} title="Tokens" className="justify-end" />,
    cell: ({ row }) => (
      <div className={`text-right tabular-nums ${metricTone('tokens', row.original.totalTokens)}`}>
        {formatTokens(row.original.totalTokens)}
      </div>
    ),
  }
}

export function costColumn<T extends { totalCostUsd?: number }>(): ColumnDef<T> {
  return {
    id: 'totalCostUsd',
    accessorFn: (s) => s.totalCostUsd,
    header: ({ column }) => <DataTableColumnHeader column={column} title="Cost" className="justify-end" />,
    cell: ({ row }) => {
      const value = row.original.totalCostUsd ?? 0
      return <div className={`text-right tabular-nums ${metricTone('cost', value)}`}>{formatCost(value)}</div>
    },
  }
}

export function durationColumn<T>(get: (row: T) => number): ColumnDef<T> {
  return {
    id: 'duration',
    accessorFn: (s) => get(s),
    header: ({ column }) => <DataTableColumnHeader column={column} title="Duration" className="justify-end" />,
    cell: ({ row }) => {
      const ms = get(row.original)
      return (
        <div className={`flex items-center justify-end gap-1 tabular-nums ${metricTone('duration', ms)}`}>
          <Clock className="size-3.5 opacity-80" />
          {formatDuration(ms)}
        </div>
      )
    },
  }
}

// Hidden column backing the Status faceted filter.
export function statusFilterColumn<T extends { hasError?: boolean }>(): ColumnDef<T> {
  return {
    id: 'status',
    accessorFn: (s) => (s.hasError ? 'error' : 'ok'),
    header: () => null,
    cell: () => null,
    filterFn: (row, _id, value: string[]) =>
      Array.isArray(value) && value.includes(row.original.hasError ? 'error' : 'ok'),
    enableSorting: false,
    enableHiding: false,
  }
}

// Hidden column backing the Score faceted filter.
export function scoreFlagColumn<T>(getId: (row: T) => string, summaries: Record<string, ScoreSummary>): ColumnDef<T> {
  return {
    id: 'scoreFlag',
    accessorFn: (s) => scoreFlagFor(summaries[getId(s)]),
    header: () => null,
    cell: () => null,
    filterFn: (row, _id, value: string[]) => {
      if (!Array.isArray(value) || value.length === 0) return true
      const flags = scoreFlagsFor(summaries[getId(row.original)])
      return value.some((v) => (flags as string[]).includes(v))
    },
    enableSorting: false,
    enableHiding: false,
  }
}

// userId-primary cell (traces/spans). The sessions table renders its own
// userName-primary variant.
export function userColumn<T extends { userId?: string; userName?: string }>(): ColumnDef<T> {
  return {
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
  }
}
