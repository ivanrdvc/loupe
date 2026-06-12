import { useQuery } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import * as React from 'react'
import type { AutoRefreshInterval } from '#/components/auto-refresh-select'
import type { FacetedFilterSpec } from '#/components/data-table-toolbar'
import { ScopedEmptyState } from '#/components/scoped-empty-state'
import { Spinner } from '#/components/spinner'
import { TelemetryDataTable } from '#/components/telemetry-data-table'
import { ListScoreActions, scoreSummariesQuery } from '#/features/evaluation'
import { getNoteFlagsForKind } from '#/features/notes/server'
import { queryKeys } from '#/lib/query-keys'
import type { SessionSummary } from '#/lib/telemetry'
import type { TimeRange } from '#/lib/time-range'
import { buildSessionColumns } from './columns'

const FILTERS: FacetedFilterSpec[] = [
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

interface DataTableProps {
  data: SessionSummary[]
  isLoading?: boolean
  onRowClick?: (row: SessionSummary) => void
  rowClassName?: (row: SessionSummary) => string | undefined
  range: TimeRange
  onRangeChange: (range: TimeRange) => void
  autoRefresh: AutoRefreshInterval
  onAutoRefreshChange: (interval: AutoRefreshInterval) => void
  onRefresh: () => void
  refreshing?: boolean
}

export function DataTable(props: DataTableProps) {
  const { data: noteFlags } = useQuery({
    queryKey: queryKeys.notes.flagsForKind('session'),
    queryFn: () => getNoteFlagsForKind({ data: 'session' }),
  })
  const { data: scoreSummaries } = useQuery(scoreSummariesQuery('session'))
  const columns = React.useMemo(
    () => buildSessionColumns(noteFlags ?? {}, scoreSummaries ?? {}),
    [noteFlags, scoreSummaries],
  )

  return (
    <TelemetryDataTable
      {...props}
      columns={columns}
      getRowId={(row) => row.sessionId}
      filters={FILTERS}
      searchColumnId="sessionId"
      searchPlaceholder="Search agents, users, ids…"
      defaultColumnVisibility={{ status: false, scoreFlag: false }}
      actions={(table) => (
        <ListScoreActions
          table={table}
          buildReviewItem={(session) => ({
            targetKind: 'session',
            targetId: session.sessionId,
            parentSessionId: session.sessionId,
            title: session.title ?? session.sessionId,
            previewText: session.firstInput ?? null,
          })}
        />
      )}
      emptyState={({ isLoading, scopeToMe, userId }) =>
        isLoading ? (
          <Spinner size="md" className="text-muted-foreground" />
        ) : scopeToMe && userId ? (
          <ScopedEmptyState entity="sessions" />
        ) : (
          <div className="max-w-md space-y-1 text-center text-pretty text-muted-foreground">
            <div>No sessions in this window.</div>
            <div className="text-xs">
              Set <code className="rounded bg-muted px-1 py-0.5 font-mono">gen_ai.conversation.id</code> or{' '}
              <code className="rounded bg-muted px-1 py-0.5 font-mono">ag_ui.thread_id</code> on the producer to enable
              session grouping. Individual traces appear on{' '}
              <Link to="/traces" className="underline">
                /traces
              </Link>
              .
            </div>
          </div>
        )
      }
    />
  )
}
