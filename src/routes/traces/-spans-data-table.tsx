import type { AutoRefreshInterval } from '#/components/auto-refresh-select'
import type { FacetedFilterSpec, ServerFilters } from '#/components/data-table-toolbar'
import { Spinner } from '#/components/spinner'
import { TelemetryDataTable } from '#/components/telemetry-data-table'
import type { SpanSummary } from '#/lib/telemetry'
import type { TimeRange } from '#/lib/time-range'
import { spanColumns } from './-spans-columns'

export const SPAN_SERVER_FACETS: FacetedFilterSpec[] = [
  {
    columnId: 'kind',
    title: 'Kind',
    options: [
      { label: 'Utility', value: 'utility' },
      { label: 'Sub-agent', value: 'sub-agent' },
    ],
  },
]

interface SpansDataTableProps {
  data: SpanSummary[]
  isLoading?: boolean
  onRowClick?: (row: SpanSummary) => void
  range: TimeRange
  onRangeChange: (range: TimeRange) => void
  autoRefresh: AutoRefreshInterval
  onAutoRefreshChange: (interval: AutoRefreshInterval) => void
  onRefresh: () => void
  refreshing?: boolean
  serverFilters?: ServerFilters
  serverPagination?: { pageIndex: number; hasMore: boolean; onPageChange: (pageIndex: number) => void }
}

export function SpansDataTable(props: SpansDataTableProps) {
  return (
    <TelemetryDataTable
      {...props}
      columns={spanColumns}
      getRowId={(row) => row.spanId}
      filters={[]}
      searchPlaceholder="Search spans, purposes, users…"
      emptyState={({ isLoading }) =>
        isLoading ? (
          <Spinner size="md" className="text-muted-foreground" />
        ) : (
          <div className="text-muted-foreground">No purpose-attr spans in this window.</div>
        )
      }
    />
  )
}
