import { useQuery } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import { InspectDrawer } from '#/components/inspect/drawer'
import type { Span } from '#/lib/spans'
import { sessionQuery } from '../-data'

/** Placeholder session id — only used while the detail query is disabled; never fetched. */
const SESSION_DRAWER_PLACEHOLDER = '__sessions_drawer_closed__'
const SESSION_DRAWER_CLOSE_RETENTION_MS = 220
/** Wide default window for the cross-page drawer; full page uses the toolbar range instead. */
const DRAWER_LOOKUP_RANGE = 30

interface RetainedSessionPreview {
  sessionId: string
  spans: Span[]
}

interface SessionsDrawerHostProps {
  previewSessionId: string | null
  onClose: () => void
}

export function SessionsDrawerHost({ previewSessionId, onClose }: SessionsDrawerHostProps) {
  const open = previewSessionId !== null
  const queryId = previewSessionId ?? SESSION_DRAWER_PLACEHOLDER

  const { data, isLoading } = useQuery({
    ...sessionQuery(queryId, DRAWER_LOOKUP_RANGE),
    enabled: open,
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
  const spans = displayPreview?.spans ?? []
  const service = spans[0]?.service
  const hasError = spans.some((s) => s.hasError)

  return (
    <InspectDrawer
      open={open}
      onClose={() => onClose()}
      inspectKey={displayPreview?.sessionId ?? null}
      spans={spans}
      loading={open ? isLoading : false}
      title={displayPreview?.sessionId}
      service={service}
      hasError={hasError}
      expandSession={displayPreview ? { sessionId: displayPreview.sessionId, range: DRAWER_LOOKUP_RANGE } : undefined}
    />
  )
}
