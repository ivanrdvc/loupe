import { useCallback, useEffect, useMemo, useState } from 'react'
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

export function ensureRootIn(prev: Set<string>, id: string): Set<string> {
  if (prev.has(id)) return prev
  const next = new Set(prev)
  next.add(id)
  return next
}

export function useRawRoots(view: InspectorView): RawRootsControl {
  const [rawRoots, setRawRoots] = useState<Set<string>>(() => new Set())
  const [rawAllOn, setRawAllOn] = useState(false)

  const topLevelIds = useMemo(() => view.spans.filter((s) => !s.parentId).map((s) => s.id), [view.spans])

  const toggleRoot = useCallback((id: string) => {
    setRawRoots((prev) => toggleRootIn(prev, id))
  }, [])

  const ensureRoot = useCallback((id: string) => {
    setRawRoots((prev) => ensureRootIn(prev, id))
  }, [])

  const toggleAll = useCallback(() => {
    setRawAllOn((prev) => {
      const next = !prev
      setRawRoots(next ? new Set(topLevelIds) : new Set())
      return next
    })
  }, [topLevelIds])

  useEffect(() => {
    if (!rawAllOn) return
    setRawRoots((prev) => {
      let next: Set<string> | null = null
      for (const id of topLevelIds) {
        if (!prev.has(id)) {
          if (!next) next = new Set(prev)
          next.add(id)
        }
      }
      return next ?? prev
    })
  }, [rawAllOn, topLevelIds])

  return {
    rawRoots,
    toggleRoot,
    ensureRoot,
    rawAllOn,
    toggleAll,
  }
}
