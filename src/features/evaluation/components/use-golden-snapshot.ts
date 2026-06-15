import { useQuery } from '@tanstack/react-query'
import { useMemo } from 'react'
import { traceSpansQuery } from '#/features/inspect'
import type { ScoreTargetKind } from '#/lib/eval/evaluation'
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
  const targetSpanId = targetKind === 'span' ? (targetId ?? null) : null
  const snapshot = useMemo(
    () => (traceData?.spans ? traceEvalSnapshot(traceData.spans, targetSpanId) : null),
    [traceData?.spans, targetSpanId],
  )
  return { snapshot, traceData, isLoading, traceId }
}
