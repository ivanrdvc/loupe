import { useRouterState, useSearch } from '@tanstack/react-router'
import { ChevronsRight, Plus } from 'lucide-react'
import { useState } from 'react'
import { Button } from '#/components/ui/button.tsx'
import { cn } from '#/lib/utils'
import type { PageContext } from '../server/prompt'
import { AssistantChat } from './assistant-chat'
import { useAssistant } from './assistant-provider'

const PANEL_WIDTH = '26rem'

/** Right-side push panel — a flex sibling of SidebarInset, so content shrinks rather than overlays. */
export function AssistantPanel() {
  const { enabled, open, setOpen } = useAssistant()
  // Remount to reset the conversation.
  const [chatKey, setChatKey] = useState(0)
  const pathname = useRouterState({ select: (s) => s.location.pathname })
  const search = useSearch({ strict: false }) as { trace?: string; session?: string }

  if (!enabled) return null

  const context: PageContext = {
    pathname,
    traceId: typeof search.trace === 'string' ? search.trace : undefined,
    sessionId: !search.trace && typeof search.session === 'string' ? search.session : undefined,
  }

  return (
    <aside
      className={cn(
        'shrink-0 overflow-hidden border-l bg-background transition-[width] duration-200 ease-linear',
        open ? '' : 'border-l-0',
      )}
      style={{ width: open ? PANEL_WIDTH : 0 }}
      aria-hidden={!open}
    >
      <div className="flex h-svh flex-col" style={{ width: PANEL_WIDTH }}>
        <header className="flex h-12 shrink-0 items-center justify-between gap-2 px-3">
          <div className="rounded-md bg-muted px-2.5 py-1 text-sm font-medium">Assistant</div>
          <div className="flex items-center gap-0.5 text-muted-foreground">
            <Button
              variant="ghost"
              size="icon"
              className="size-7"
              title="New chat"
              onClick={() => setChatKey((k) => k + 1)}
            >
              <Plus className="size-4" />
            </Button>
            <Button variant="ghost" size="icon" className="size-7" title="Collapse" onClick={() => setOpen(false)}>
              <ChevronsRight className="size-4" />
            </Button>
          </div>
        </header>
        {open && <AssistantChat key={chatKey} context={context} />}
      </div>
    </aside>
  )
}
