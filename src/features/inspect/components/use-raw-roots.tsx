import { useCallback, useMemo, useState } from 'react'
import type { InspectorView } from '#/features/inspect/logic'

export interface RawRootsControl {
  rawRoots: Set<string>
  toggleRoot: (id: string) => void
  ensureRoot: (id: string) => void
  rawAllOn: boolean
  toggleAll: () => void
}

// Pure state transitions — exported for unit tests. Always return the input
// reference when no change is needed so React skips the re-render.
export function toggleRootIn(prev: Set<string>, id: string): Set<string> {
  const next = new Set(prev)
  if (next.has(id)) next.delete(id)
  else next.add(id)
  return next
}

// A root is raw when the global default (rawAllOn) is flipped by a per-root
// override — XOR. Lets "all on minus exceptions" and "all off plus picks" coexist,
// and new traces follow the default with no reconciliation effect.
export function effectiveRawRoots(allIds: readonly string[], rawAllOn: boolean, overrides: Set<string>): Set<string> {
  const out = new Set<string>()
  for (const id of allIds) {
    if (rawAllOn !== overrides.has(id)) out.add(id)
  }
  return out
}

export function useRawRoots(view: InspectorView): RawRootsControl {
  const [rawAllOn, setRawAllOn] = useState(false)
  const [overrides, setOverrides] = useState<Set<string>>(() => new Set())

  const topLevelIds = useMemo(() => view.spans.filter((s) => !s.parentId).map((s) => s.id), [view.spans])
  const rawRoots = useMemo(
    () => effectiveRawRoots(topLevelIds, rawAllOn, overrides),
    [topLevelIds, rawAllOn, overrides],
  )

  const toggleRoot = useCallback((id: string) => {
    setOverrides((prev) => toggleRootIn(prev, id))
  }, [])

  const ensureRoot = useCallback(
    (id: string) => {
      setOverrides((prev) => {
        // Force raw on: override when default-off, clear exception when default-on.
        if (rawAllOn ? !prev.has(id) : prev.has(id)) return prev
        const next = new Set(prev)
        if (rawAllOn) next.delete(id)
        else next.add(id)
        return next
      })
    },
    [rawAllOn],
  )

  const toggleAll = useCallback(() => {
    setRawAllOn((prev) => !prev)
    setOverrides(new Set())
  }, [])

  return { rawRoots, toggleRoot, ensureRoot, rawAllOn, toggleAll }
}
