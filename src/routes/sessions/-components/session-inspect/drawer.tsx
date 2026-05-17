import { ArrowsPointingOutIcon } from '@heroicons/react/20/solid'
import { ChatBubbleLeftRightIcon, ClipboardDocumentListIcon, QueueListIcon } from '@heroicons/react/24/outline'
import { Link } from '@tanstack/react-router'
import { useEffect, useMemo, useState } from 'react'
import { type AutoRefreshInterval, AutoRefreshSelect } from '#/components/auto-refresh-select'
import { ContextWindow } from '#/components/context-window'
import { ConversationView } from '#/components/conversation-view'
import { IconTabs } from '#/components/icon-tabs'
import { Sheet, SheetContent, SheetTitle } from '#/components/ui/sheet'
import type { Span } from '#/lib/spans'
import type { TimeRangeDays } from '#/lib/time-range'
import { SessionContextView } from './context'
import { SessionInspectLayout } from './overview'

export type SessionInspectView = 'spans' | 'conversation' | 'context'
type DrawerView = SessionInspectView

export const SESSION_VIEW_TABS = [
  { id: 'spans', label: 'Spans', Icon: QueueListIcon },
  { id: 'conversation', label: 'Conversation', Icon: ChatBubbleLeftRightIcon },
  { id: 'context', label: 'Context', Icon: ClipboardDocumentListIcon },
] as const

const DRAWER_TRANSITION_MS = 200

interface SessionInspectDrawerProps {
  open: boolean
  onClose: () => void
  spans: Span[]
  loading?: boolean
  title?: string
  /** Builds in-app expand target: `/sessions/:id` with `view`, optional `span`, and `days`. */
  expandSession?: { sessionId: string; days: TimeRangeDays }
  /** Stable id for the inspected session — resets picker state when it changes while `open`. */
  inspectSessionKey?: string | null
  autoRefresh?: AutoRefreshInterval
  onAutoRefreshChange?: (value: AutoRefreshInterval) => void
  onRefresh?: () => void
  refreshing?: boolean
}

export function SessionInspectDrawer({
  open,
  onClose,
  spans,
  loading,
  title,
  expandSession,
  inspectSessionKey,
  autoRefresh,
  onAutoRefreshChange,
  onRefresh,
  refreshing,
}: SessionInspectDrawerProps) {
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [drawerView, setDrawerView] = useState<DrawerView>('spans')
  const [contentReady, setContentReady] = useState(false)

  const expandSearch = useMemo(() => {
    if (!expandSession) return undefined
    const next: { days: TimeRangeDays; view: SessionInspectView; span?: string } = {
      days: expandSession.days,
      view: drawerView,
    }
    if (drawerView === 'spans' && selectedId) next.span = selectedId
    return next
  }, [expandSession, drawerView, selectedId])

  // biome-ignore lint/correctness/useExhaustiveDependencies: keyed reset when the previewed session identity changes while the drawer stays mounted
  useEffect(() => {
    setSelectedId(null)
    setDrawerView('spans')
  }, [inspectSessionKey])

  useEffect(() => {
    let frame = 0
    let timeout = 0
    const hasSession = inspectSessionKey != null

    if (open && hasSession) {
      setContentReady(false)
      frame = window.requestAnimationFrame(() => {
        timeout = window.setTimeout(() => setContentReady(true), DRAWER_TRANSITION_MS)
      })
    } else if (open) {
      setContentReady(true)
    } else {
      timeout = window.setTimeout(() => setContentReady(false), DRAWER_TRANSITION_MS)
    }

    return () => {
      if (frame) window.cancelAnimationFrame(frame)
      if (timeout) window.clearTimeout(timeout)
    }
  }, [open, inspectSessionKey])

  const showLoading = loading || !contentReady

  return (
    <Sheet open={open} onOpenChange={(next) => !next && onClose()}>
      <SheetContent
        side="right"
        className="w-full gap-0 bg-background p-0 text-foreground sm:max-w-[940px] 2xl:max-w-[70vw]"
      >
        <header className="flex items-center justify-between border-b px-4 py-2.5">
          <div className="flex min-w-0 items-center gap-2">
            <SheetTitle className="text-sm">Session</SheetTitle>
            {title && <span className="truncate font-mono text-xs text-muted-foreground">{title}</span>}
          </div>
          <div className="flex items-center gap-1">
            {expandSession && expandSearch && (
              <Link
                to="/sessions/$sessionId"
                params={{ sessionId: expandSession.sessionId }}
                search={expandSearch}
                onClick={() => onClose()}
                aria-label="Expand to session page"
                title="Expand to session page"
                className="inline-flex size-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              >
                <ArrowsPointingOutIcon className="size-4 fill-current" aria-hidden />
              </Link>
            )}
          </div>
        </header>

        <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-b px-4 py-2">
          <IconTabs
            tabs={SESSION_VIEW_TABS}
            value={drawerView}
            onChange={setDrawerView}
            aria-label="Session inspect view"
          />
          <div className="flex flex-wrap items-center gap-2">
            {autoRefresh != null && onAutoRefreshChange != null && onRefresh != null ? (
              <AutoRefreshSelect
                value={autoRefresh}
                onChange={onAutoRefreshChange}
                onRefresh={onRefresh}
                loading={refreshing}
              />
            ) : null}
            {contentReady && drawerView === 'conversation' && spans.length > 0 && <ContextWindow spans={spans} />}
          </div>
        </div>

        <div className="flex min-h-0 flex-1 flex-col">
          {drawerView === 'conversation' ? (
            <section className="min-h-0 flex-1 overflow-hidden">
              {!contentReady || (loading && spans.length === 0) ? (
                <div className="flex h-full items-center justify-center text-xs text-muted-foreground">Loading…</div>
              ) : (
                <ConversationView spans={spans} onSelect={setSelectedId} />
              )}
            </section>
          ) : drawerView === 'context' ? (
            <section className="min-h-0 flex-1 overflow-hidden">
              {!contentReady || (loading && spans.length === 0) ? (
                <div className="flex h-full items-center justify-center text-xs text-muted-foreground">Loading…</div>
              ) : (
                <SessionContextView spans={spans} />
              )}
            </section>
          ) : (
            <div className="flex min-h-0 flex-1">
              <SessionInspectLayout
                key={inspectSessionKey ?? undefined}
                spans={contentReady ? spans : []}
                loading={showLoading}
                selectedId={selectedId}
                onSelect={setSelectedId}
              />
            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  )
}
