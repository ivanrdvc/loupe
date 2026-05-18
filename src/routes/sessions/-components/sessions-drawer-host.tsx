import { useQuery } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import {
  AUTO_REFRESH_MS,
  type AutoRefreshInterval,
  DRAWER_DEFAULT_AUTO_REFRESH_INTERVAL,
} from '#/components/auto-refresh-select'
import type { Span } from '#/lib/spans'
import type { TimeRange } from '#/lib/time-range'
import { sessionQuery } from '../-data'
import { SessionInspectDrawer } from './session-inspect/drawer'

/** Placeholder session id — only used while the detail query is disabled; never fetched. */
const SESSION_DRAWER_PLACEHOLDER = '__sessions_drawer_closed__'
const SESSION_DRAWER_CLOSE_RETENTION_MS = 220

interface RetainedSessionPreview {
  sessionId: string
  spans: Span[]
}

interface SessionsDrawerHostProps {
  previewSessionId: string | null
  range: TimeRange
  onClose: () => void
}

export function SessionsDrawerHost({ previewSessionId, range, onClose }: SessionsDrawerHostProps) {
  const open = previewSessionId !== null
  const queryId = previewSessionId ?? SESSION_DRAWER_PLACEHOLDER

  const [autoRefresh, setAutoRefresh] = useState<AutoRefreshInterval>(DRAWER_DEFAULT_AUTO_REFRESH_INTERVAL)
  const { data, isLoading, isFetching, refetch } = useQuery({
    ...sessionQuery(queryId, range),
    enabled: open,
    refetchInterval: open ? AUTO_REFRESH_MS[autoRefresh] : false,
  })
  const [retainedPreview, setRetainedPreview] = useState<RetainedSessionPreview | null>(null)

  useEffect(() => {
    let timeout = 0

    if (previewSessionId) {
      setRetainedPreview({ sessionId: previewSessionId, spans: data?.spans ?? [] })
    } else {
      timeout = window.setTimeout(() => setRetainedPreview(null), SESSION_DRAWER_CLOSE_RETENTION_MS)
    }

    return () => {
      if (timeout) window.clearTimeout(timeout)
    }
  }, [previewSessionId, data?.spans])

  const displayPreview = previewSessionId ? { sessionId: previewSessionId, spans: data?.spans ?? [] } : retainedPreview

  return (
    <SessionInspectDrawer
      open={open}
      onClose={() => onClose()}
      inspectSessionKey={displayPreview?.sessionId ?? null}
      spans={displayPreview?.spans ?? []}
      loading={open ? isLoading : false}
      title={displayPreview?.sessionId}
      expandSession={displayPreview ? { sessionId: displayPreview.sessionId, range } : undefined}
      autoRefresh={autoRefresh}
      onAutoRefreshChange={setAutoRefresh}
      onRefresh={() => {
        void refetch()
      }}
      refreshing={isFetching}
    />
  )
}
