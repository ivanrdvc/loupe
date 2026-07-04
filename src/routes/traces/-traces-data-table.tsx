import * as React from 'react'
import type { AutoRefreshInterval } from '#/components/auto-refresh-select'
import type { FacetedFilterSpec, ServerFilters } from '#/components/data-table-toolbar'
import { Spinner } from '#/components/spinner'
import { TelemetryDataTable } from '#/components/telemetry-data-table'
import { ListScoreActions } from '#/features/evaluation'
import type { ScoreSummary } from '#/lib/eval/evaluation'
import type { TraceSummary } from '#/lib/telemetry'
import type { TimeRange } from '#/lib/time-range'
import { makeTraceColumns } from './-columns'

// Category + status filter server-side (URL params → provider WHERE).
export const TRACE_SERVER_FACETS: FacetedFilterSpec[] = [
  {
    columnId: 'category',
    title: 'Category',
    options: [
      { label: 'Chat', value: 'chat' },
      { label: 'Sub-agent', value: 'sub-agent' },
      { label: 'Scheduled', value: 'scheduled' },
      { label: 'Event', value: 'event' },
      { label: 'Webhook', value: 'webhook' },
      { label: 'Background', value: 'background' },
      { label: 'Utility', value: 'utility' },
      { label: 'Orphan', value: 'orphan' },
    ],
  },
  {
    columnId: 'status',
    title: 'Status',
    options: [
      { label: 'OK', value: 'ok' },
      { label: 'Error', value: 'error' },
    ],
  },
]

// Score flags come from the scores DB (a join, not telemetry) — page-local, client-side.
const CLIENT_FILTERS: FacetedFilterSpec[] = [
  {
    columnId: 'scoreFlag',
    title: 'Score',
    options: [
      { label: 'Needs attention', value: 'bad' },
      { label: 'Disagreement', value: 'disagreement' },
      { label: 'Scored', value: 'scored' },
      { label: 'Unscored', value: 'unscored' },
    ],
  },
]

interface TracesDataTableProps {
  data: TraceSummary[]
  isLoading?: boolean
  onRowClick?: (row: TraceSummary) => void
  range: TimeRange
  onRangeChange: (range: TimeRange) => void
  autoRefresh: AutoRefreshInterval
  onAutoRefreshChange: (interval: AutoRefreshInterval) => void
  onRefresh: () => void
  refreshing?: boolean
  scoreSummaries?: Record<string, ScoreSummary>
  serverFilters?: ServerFilters
  serverPagination?: { pageIndex: number; hasMore: boolean; onPageChange: (pageIndex: number) => void }
}

export function TracesDataTable({ scoreSummaries, ...props }: TracesDataTableProps) {
  const columns = React.useMemo(() => makeTraceColumns(scoreSummaries ?? {}), [scoreSummaries])

  return (
    <TelemetryDataTable
      {...props}
      columns={columns}
      getRowId={(row) => row.id}
      filters={CLIENT_FILTERS}
      searchPlaceholder="Search traces, agents, users…"
      defaultColumnVisibility={{ status: false, scoreFlag: false }}
      actions={(table) => (
        <ListScoreActions
          table={table}
          buildReviewItem={(trace) => ({
            targetKind: 'trace',
            targetId: trace.id,
            parentTraceId: trace.id,
            title: trace.id,
            traceId: trace.id,
          })}
        />
      )}
      emptyState={({ isLoading }) =>
        isLoading ? (
          <Spinner size="md" className="text-muted-foreground" />
        ) : (
          <div className="text-muted-foreground">No traces in this window.</div>
        )
      }
    />
  )
}
