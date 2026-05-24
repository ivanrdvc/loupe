import { Clock01Icon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { useMemo } from 'react'
import { type SearchProvider, useRegisterSearchProvider } from '#/components/command-palette'
import { RelativeTime } from '#/components/relative-time'
import { Badge } from '#/components/ui/badge'
import type { SessionSummary } from '#/lib/telemetry'

const MAX_AGENTS_SHOWN = 2

export function useSessionSearch({
  sessions,
  onSelect,
}: {
  sessions: SessionSummary[]
  onSelect: (sessionId: string) => void
}) {
  const provider = useMemo<SearchProvider | null>(() => {
    if (sessions.length === 0) return null
    return {
      id: 'sessions-list',
      group: 'Sessions in this window',
      items: sessions.map((session) => {
        const title = session.title?.trim()
        const firstInput = session.firstInput?.trim()
        const agents = session.agents.filter(Boolean)
        const agentsLabel = agents.slice(0, MAX_AGENTS_SHOWN).join(', ')
        const label = title || firstInput || agentsLabel || 'Untitled session'
        const metaParts = [session.userName ?? '', agentsLabel].filter(Boolean)
        return {
          id: session.sessionId,
          label,
          keywords: [
            session.sessionId,
            title ?? '',
            session.userName ?? '',
            session.userId ?? '',
            session.host ?? '',
            session.agents.join(' '),
            session.firstInput ?? '',
          ].join(' '),
          leading: session.hasError ? (
            <Badge variant="destructive" className="px-1.5">
              Error
            </Badge>
          ) : undefined,
          trailing: (
            <span className="ml-auto flex shrink-0 items-center gap-2 text-[11px] text-muted-foreground">
              {metaParts.length > 0 && <span className="max-w-[220px] truncate">{metaParts.join(' · ')}</span>}
              <span className="inline-flex items-center gap-1 tabular-nums">
                <HugeiconsIcon icon={Clock01Icon} strokeWidth={2} className="size-3" />
                <RelativeTime ts={session.lastSeenMs} />
              </span>
            </span>
          ),
          onSelect: () => onSelect(session.sessionId),
        }
      }),
    }
  }, [sessions, onSelect])

  useRegisterSearchProvider(provider)
}
