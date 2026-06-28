import { useRouterState, useSearch } from '@tanstack/react-router'
import { ChevronsRight, Plus } from 'lucide-react'
import { useEffect, useMemo, useState, useSyncExternalStore } from 'react'
import { Button } from '#/components/ui/button.tsx'
import { cn } from '#/lib/utils'
import type { PageContext } from '../logic/request'
import { loadSession, newSession, sessionStore } from '../logic/sessions'
import { AgentChat } from './agent-chat'
import { useAgent } from './agent-provider'
import { SessionHistory } from './agent-sessions'

const PANEL_WIDTH = '26rem'
const ORIGIN = typeof window === 'undefined' ? undefined : window.location.origin

/**
 * Right-side push panel — a flex sibling of SidebarInset, so content shrinks rather than overlays.
 */
export function AgentPanel() {
  const { enabled, open, setOpen } = useAgent()
  const { activeId } = useSyncExternalStore(
    sessionStore.subscribe,
    sessionStore.getSnapshot,
    sessionStore.getServerSnapshot,
  )
  const initialMessages = useMemo(() => loadSession(activeId), [activeId])
  // Keep mounted after first open so the chat survives a collapse.
  const [hasOpened, setHasOpened] = useState(false)
  useEffect(() => {
    if (open) setHasOpened(true)
  }, [open])
  const pathname = useRouterState({ select: (s) => s.location.pathname })
  const search = useSearch({ strict: false }) as { trace?: string; session?: string }

  const context: PageContext = useMemo(
    () => ({
      pathname,
      origin: ORIGIN,
      traceId: typeof search.trace === 'string' ? search.trace : undefined,
      sessionId: !search.trace && typeof search.session === 'string' ? search.session : undefined,
    }),
    [pathname, search.trace, search.session],
  )

  if (!enabled) return null

  return (
    <aside
      className={cn(
        'shrink-0 overflow-hidden border-l bg-background transition-[width] duration-200 ease-out [will-change:width]',
        open ? '' : 'border-l-0',
      )}
      style={{ width: open ? PANEL_WIDTH : 0 }}
      aria-hidden={!open}
    >
      <div className="flex h-svh flex-col" style={{ width: PANEL_WIDTH }}>
        <header className="flex h-12 shrink-0 items-center justify-between gap-2 px-3">
          <div className="rounded-md bg-muted px-2.5 py-1 text-sm font-medium">Agent</div>
          <div className="flex items-center gap-0.5 text-muted-foreground">
            <Button variant="ghost" size="icon" className="size-7" title="New session" onClick={() => newSession()}>
              <Plus className="size-4" />
            </Button>
            <SessionHistory activeId={activeId} />
            <Button variant="ghost" size="icon" className="size-7" title="Collapse" onClick={() => setOpen(false)}>
              <ChevronsRight className="size-4" />
            </Button>
          </div>
        </header>
        {hasOpened && (
          <AgentChat key={activeId} sessionId={activeId} initialMessages={initialMessages} context={context} />
        )}
      </div>
    </aside>
  )
}
