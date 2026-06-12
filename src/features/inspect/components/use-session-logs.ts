import { useQuery } from '@tanstack/react-query'
import { useMemo } from 'react'
import { fetchSessionLogs } from '#/features/inspect/server/logs'
import { queryKeys } from '#/lib/query-keys'
import type { Span } from '#/lib/spans'
import type { LogLevel } from '#/lib/telemetry/types'

export const LEVEL_VARIANT: Record<LogLevel, 'outline' | 'secondary' | 'warning' | 'destructive'> = {
  trace: 'outline',
  debug: 'outline',
  info: 'secondary',
  warn: 'warning',
  error: 'destructive',
  fatal: 'destructive',
}

export function useSessionLogs(spans: Span[], opts?: { enabled?: boolean }) {
  const traceIds = useMemo(() => [...new Set(spans.map((s) => s.traceId).filter(Boolean))].sort(), [spans])
  const window = useMemo(() => {
    if (spans.length === 0) return undefined
    let from = spans[0].startMs
    let to = spans[0].endMs
    for (const s of spans) {
      if (s.startMs < from) from = s.startMs
      if (s.endMs > to) to = s.endMs
    }
    return { fromUs: from * 1000, toUs: to * 1000 }
  }, [spans])

  const query = useQuery({
    queryKey: queryKeys.logs.byTraceIds(traceIds),
    queryFn: () => fetchSessionLogs({ data: { traceIds, ...window } }),
    enabled: (opts?.enabled ?? true) && traceIds.length > 0,
    staleTime: 30_000,
  })

  return { ...query, traceIds }
}
