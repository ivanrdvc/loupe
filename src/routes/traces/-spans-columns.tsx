import { Link } from '@tanstack/react-router'
import type { ColumnDef } from '@tanstack/react-table'
import { DataTableColumnHeader } from '#/components/data-table-column-header'
import { KindBadge } from '#/components/kind-badge'
import { RelativeTime } from '#/components/relative-time'
import { costColumn, durationColumn, tokensColumn, userColumn } from '#/components/table-columns'
import { Badge } from '#/components/ui/badge'
import { truncateId } from '#/lib/format'
import type { SpanSummary } from '#/lib/telemetry'
import { ACCENT } from '#/lib/tone'

export const spanColumns: ColumnDef<SpanSummary>[] = [
  {
    accessorKey: 'startedAtMs',
    header: ({ column }) => <DataTableColumnHeader column={column} title="When" />,
    cell: ({ row }) => (
      <RelativeTime ts={row.original.startedAtMs} className="whitespace-nowrap tabular-nums text-muted-foreground" />
    ),
  },
  {
    accessorKey: 'spanName',
    header: ({ column }) => <DataTableColumnHeader column={column} title="Span" />,
    cell: ({ row }) => {
      const s = row.original
      const display = s.spanName.replace(/\s*\([0-9a-f-]{8,}\)\s*$/i, '')
      return (
        <div className="flex min-w-0 items-center gap-1.5">
          <span className="block max-w-[260px] truncate" title={s.spanName}>
            {display}
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
    cell: ({ row }) => <KindBadge kind={row.original.kind} />,
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
        <span
          className="whitespace-nowrap rounded bg-muted px-1.5 py-0.5 font-mono text-[10px] font-medium text-muted-foreground"
          title={row.original.label}
        >
          {row.original.label}
        </span>
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
        <span className={`font-mono text-[11px] ${ACCENT.violet.ident}`}>{m}</span>
      ) : (
        <span className="text-muted-foreground/60">—</span>
      )
    },
    enableSorting: false,
  },
  tokensColumn<SpanSummary>(),
  costColumn<SpanSummary>(),
  durationColumn<SpanSummary>((s) => s.durationMs),
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
  userColumn<SpanSummary>(),
]
