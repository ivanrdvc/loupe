import { useCallback, useSyncExternalStore } from 'react'
import { getChangelogLastSeen, subscribeChangelogSeen } from '#/lib/changelog-seen'

// Server snapshot reports the current version ("seen") so the dot never renders
// during SSR — it appears only after the client reads an older localStorage value.
export function useChangelogUnseen(currentVersion: string): boolean {
  const getServerSnapshot = useCallback(() => currentVersion, [currentVersion])
  const lastSeen = useSyncExternalStore(subscribeChangelogSeen, getChangelogLastSeen, getServerSnapshot)
  return lastSeen !== currentVersion
}
