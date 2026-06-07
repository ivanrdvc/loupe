import { type QueryKey, type UseQueryOptions, useQuery } from '@tanstack/react-query'
import { type ComponentProps, useEffect, useState } from 'react'
import { AUTO_REFRESH_MS } from '#/components/auto-refresh-select'
import { InspectDrawer } from '#/features/inspect/components/drawer'
import { useInspectAutoRefresh } from '#/hooks/use-auto-refresh'
import type { Span } from '#/lib/spans'

/** Placeholder id — only used while the detail query is disabled; never fetched. */
const PLACEHOLDER_ID = '__inspect_drawer_closed__'
const CLOSE_RETENTION_MS = 220

type ExpandProps = Pick<ComponentProps<typeof InspectDrawer>, 'expandSession' | 'expandTrace'>

interface InspectDrawerHostProps<T extends { spans: Span[] }, K extends QueryKey> {
  previewId: string | null
  onClose: () => void
  query: (id: string) => UseQueryOptions<T | null, Error, T | null, K>
  expand: (id: string) => ExpandProps
}

/** Cross-page session/trace drawer: fetches an entity's spans, retaining the last
 * preview briefly on close so the Sheet animates out without flashing empty. */
export function InspectDrawerHost<T extends { spans: Span[] }, K extends QueryKey>({
  previewId,
  onClose,
  query,
  expand,
}: InspectDrawerHostProps<T, K>) {
  const open = previewId !== null
  const queryId = previewId ?? PLACEHOLDER_ID
  const [autoRefresh, setAutoRefresh] = useInspectAutoRefresh()

  const { data, isLoading, isFetching, refetch } = useQuery({
    ...query(queryId),
    enabled: open,
    refetchInterval: open ? AUTO_REFRESH_MS[autoRefresh] : false,
  })
  const [retained, setRetained] = useState<{ id: string; spans: Span[] } | null>(null)

  useEffect(() => {
    let timeout = 0
    if (previewId) {
      setRetained({ id: previewId, spans: data?.spans ?? [] })
    } else {
      timeout = window.setTimeout(() => setRetained(null), CLOSE_RETENTION_MS)
    }
    return () => {
      if (timeout) window.clearTimeout(timeout)
    }
  }, [previewId, data?.spans])

  const display = previewId ? { id: previewId, spans: data?.spans ?? [] } : retained
  const spans = display?.spans ?? []

  return (
    <InspectDrawer
      open={open}
      onClose={onClose}
      inspectKey={display?.id ?? null}
      spans={spans}
      loading={open ? isLoading : false}
      title={display?.id}
      service={spans[0]?.service}
      hasError={spans.some((s) => s.hasError)}
      {...(display ? expand(display.id) : {})}
      autoRefresh={autoRefresh}
      onAutoRefreshChange={setAutoRefresh}
      onRefresh={() => {
        void refetch()
      }}
      refreshing={isFetching}
    />
  )
}
