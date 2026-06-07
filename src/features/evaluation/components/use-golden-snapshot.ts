import { useQuery } from '@tanstack/react-query'
import { useMemo } from 'react'
import type { ScoreTargetKind } from '#/lib/eval/evaluation'
import { traceSpansQuery } from '#/routes/traces/-data'
import { traceEvalSnapshot } from './span-snapshot'

// Shared golden-capture wiring for both review surfaces (ReviewSheetButton + ReviewModeDialog):
// resolve the target's trace, load its spans, and pick the eval-span snapshot.
export function useGoldenSnapshot({
  open,
  targetKind,
  targetId,
  parentTraceId,
  traceId: explicitTraceId,
}: {
  open: boolean
  targetKind: ScoreTargetKind
  targetId?: string | null
  parentTraceId?: string | null
  traceId?: string | null
}) {
  const traceId = explicitTraceId ?? (targetKind === 'trace' ? (targetId ?? null) : (parentTraceId ?? null))
  const { data: traceData, isLoading } = useQuery({
    ...traceSpansQuery(traceId ?? '__no_trace__'),
    enabled: open && traceId != null,
  })
  const snapshot = useMemo(() => (traceData?.spans ? traceEvalSnapshot(traceData.spans) : null), [traceData?.spans])
  return { snapshot, traceData, isLoading, traceId }
}
