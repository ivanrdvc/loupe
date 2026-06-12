import * as React from 'react'
import type { AutoRefreshInterval } from '#/components/auto-refresh-select'
import type { FacetedFilterSpec } from '#/components/data-table-toolbar'
import { ScopedEmptyState } from '#/components/scoped-empty-state'
import { Spinner } from '#/components/spinner'
import { TelemetryDataTable } from '#/components/telemetry-data-table'
import { ListScoreActions } from '#/features/evaluation'
import type { ScoreSummary } from '#/lib/eval/evaluation'
import type { TraceSummary } from '#/lib/telemetry'
import type { TimeRange } from '#/lib/time-range'
import { makeTraceColumns } from './-columns'

const FILTERS: FacetedFilterSpec[] = [
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
}

export function TracesDataTable({ scoreSummaries, ...props }: TracesDataTableProps) {
  const columns = React.useMemo(() => makeTraceColumns(scoreSummaries ?? {}), [scoreSummaries])

  return (
    <TelemetryDataTable
      {...props}
      columns={columns}
      getRowId={(row) => row.id}
      filters={FILTERS}
      searchColumnId="id"
      searchPlaceholder="Search traces, agents, users…"
      defaultColumnVisibility={{ status: false, category: false, scoreFlag: false }}
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
      emptyState={({ isLoading, scopeToMe, userId }) =>
        isLoading ? (
          <Spinner size="md" className="text-muted-foreground" />
        ) : scopeToMe && userId ? (
          <ScopedEmptyState entity="traces" />
        ) : (
          <div className="text-muted-foreground">No traces in this window.</div>
        )
      }
    />
  )
}
