import { useQuery } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import { AUTO_REFRESH_MS } from '#/components/auto-refresh-select'
import { InspectDrawer } from '#/components/inspect/drawer'
import { useInspectAutoRefresh } from '#/hooks/use-auto-refresh'
import type { Span } from '#/lib/spans'
import { traceSpansQuery } from '../-data'

/** Placeholder trace id — only used while the detail query is disabled; never fetched. */
const TRACE_DRAWER_PLACEHOLDER = '__traces_drawer_closed__'
const TRACE_DRAWER_CLOSE_RETENTION_MS = 220

interface RetainedTracePreview {
  traceId: string
  spans: Span[]
}

interface TraceInspectDrawerHostProps {
  previewTraceId: string | null
  onClose: () => void
}

export function TraceInspectDrawerHost({ previewTraceId, onClose }: TraceInspectDrawerHostProps) {
  const open = previewTraceId !== null
  const queryId = previewTraceId ?? TRACE_DRAWER_PLACEHOLDER
  const [autoRefresh, setAutoRefresh] = useInspectAutoRefresh()

  const { data, isLoading, isFetching, refetch } = useQuery({
    ...traceSpansQuery(queryId),
    enabled: open,
    refetchInterval: open ? AUTO_REFRESH_MS[autoRefresh] : false,
  })
  const [retainedPreview, setRetainedPreview] = useState<RetainedTracePreview | null>(null)

  useEffect(() => {
    let timeout = 0

    if (previewTraceId) {
      setRetainedPreview({ traceId: previewTraceId, spans: data?.spans ?? [] })
    } else {
      timeout = window.setTimeout(() => setRetainedPreview(null), TRACE_DRAWER_CLOSE_RETENTION_MS)
    }

    return () => {
      if (timeout) window.clearTimeout(timeout)
    }
  }, [previewTraceId, data?.spans])

  const displayPreview = previewTraceId ? { traceId: previewTraceId, spans: data?.spans ?? [] } : retainedPreview
  const spans = displayPreview?.spans ?? []
  const service = spans[0]?.service
  const hasError = spans.some((s) => s.hasError)

  return (
    <InspectDrawer
      open={open}
      onClose={() => onClose()}
      inspectKey={displayPreview?.traceId ?? null}
      spans={spans}
      loading={open ? isLoading : false}
      title={displayPreview?.traceId}
      service={service}
      hasError={hasError}
      expandTrace={displayPreview ? { traceId: displayPreview.traceId } : undefined}
      autoRefresh={autoRefresh}
      onAutoRefreshChange={setAutoRefresh}
      onRefresh={() => {
        void refetch()
      }}
      refreshing={isFetching}
    />
  )
}
