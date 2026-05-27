import { useCallback, useMemo, useState } from 'react'
import type { InspectorView } from '#/lib/inspector-view'

export interface RawRootsControl {
  rawRoots: Set<string>
  toggleRoot: (id: string) => void
  ensureRoot: (id: string) => void
  rawAllOn: boolean
  toggleAll: () => void
}

// Centralized state for per-trace raw-spans. A root is "on" when its id is in
// the set. The toolbar's bulk control flips between empty (all off) and the
// full set of top-level span ids (all on); per-row controls flip one at a time.
export function useRawRoots(view: InspectorView): RawRootsControl {
  const [rawRoots, setRawRoots] = useState<Set<string>>(() => new Set())

  const topLevelIds = useMemo(() => view.spans.filter((s) => !s.parentId).map((s) => s.id), [view.spans])

  const toggleRoot = useCallback((id: string) => {
    setRawRoots((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }, [])

  const ensureRoot = useCallback((id: string) => {
    setRawRoots((prev) => {
      if (prev.has(id)) return prev
      const next = new Set(prev)
      next.add(id)
      return next
    })
  }, [])

  const toggleAll = useCallback(() => {
    setRawRoots((prev) => (prev.size > 0 ? new Set() : new Set(topLevelIds)))
  }, [topLevelIds])

  return {
    rawRoots,
    toggleRoot,
    ensureRoot,
    rawAllOn: rawRoots.size > 0,
    toggleAll,
  }
}
