import * as Headless from '@headlessui/react'
import { XMarkIcon } from '@heroicons/react/16/solid'
import { ArrowsPointingOutIcon } from '@heroicons/react/20/solid'
import { ChatBubbleLeftRightIcon, ClipboardDocumentListIcon, QueueListIcon } from '@heroicons/react/24/outline'
import { useEffect, useMemo, useState } from 'react'
import { type AutoRefreshInterval, AutoRefreshSelect } from '#/components/auto-refresh-select'
import { ContextWindow } from '#/components/context-window'
import { ConversationView } from '#/components/conversation-view'
import { IconTabs } from '#/components/icon-tabs'
import { Link } from '#/components/ui/catalyst/link'
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

  const expandSearch = useMemo((): Record<string, unknown> | undefined => {
    if (!expandSession) return undefined
    const next: Record<string, unknown> = {
      view: drawerView,
    }
    if (expandSession.days !== 1) next.days = expandSession.days
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
    <Headless.Dialog open={open} onClose={onClose} autoFocus={false}>
      <Headless.DialogBackdrop
        transition
        className="fixed inset-0 z-40 bg-zinc-950/40 transition-opacity duration-200 ease-out data-closed:opacity-0 dark:bg-zinc-950/60"
      />
      <div className="fixed inset-y-0 right-0 z-50 flex w-full max-w-[940px] 2xl:max-w-[70vw]">
        <Headless.DialogPanel
          transition
          className="flex w-full flex-col bg-white shadow-2xl ring-1 ring-zinc-950/10 transition-transform duration-200 ease-out data-closed:translate-x-full dark:bg-zinc-900 dark:ring-white/10"
        >
          <header className="flex items-center justify-between border-b border-zinc-950/10 px-4 py-2.5 dark:border-white/10">
            <div className="flex min-w-0 items-center gap-2">
              <h2 className="text-sm font-semibold tracking-tight text-zinc-950 dark:text-white">Session</h2>
              {title && <span className="truncate font-mono text-xs text-zinc-500 dark:text-zinc-400">{title}</span>}
            </div>
            <div className="flex items-center gap-1">
              {expandSession && (
                <Link
                  href={`/sessions/${expandSession.sessionId}`}
                  search={expandSearch}
                  onClick={() => onClose()}
                  aria-label="Expand to session page"
                  title="Expand to session page"
                  className="inline-flex size-7 items-center justify-center rounded-md text-zinc-500 transition-colors hover:bg-zinc-100 hover:text-zinc-950 focus:outline-hidden focus-visible:ring-2 focus-visible:ring-focus-500/80 dark:text-zinc-400 dark:hover:bg-white/5 dark:hover:text-white"
                >
                  <ArrowsPointingOutIcon className="size-4 shrink-0 fill-current" aria-hidden />
                </Link>
              )}
              <button
                type="button"
                onClick={onClose}
                aria-label="Close drawer"
                className="inline-flex size-7 items-center justify-center rounded-md text-zinc-500 hover:bg-zinc-100 hover:text-zinc-950 dark:text-zinc-400 dark:hover:bg-white/5 dark:hover:text-white"
              >
                <XMarkIcon className="size-4 fill-current" />
              </button>
            </div>
          </header>

          <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-b border-zinc-950/10 px-4 py-2 dark:border-white/10">
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
                  <div className="flex h-full items-center justify-center text-xs text-zinc-400 dark:text-zinc-600">
                    Loading…
                  </div>
                ) : (
                  <ConversationView spans={spans} onSelect={setSelectedId} />
                )}
              </section>
            ) : drawerView === 'context' ? (
              <section className="min-h-0 flex-1 overflow-hidden">
                {!contentReady || (loading && spans.length === 0) ? (
                  <div className="flex h-full items-center justify-center text-xs text-zinc-400 dark:text-zinc-600">
                    Loading…
                  </div>
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
        </Headless.DialogPanel>
      </div>
    </Headless.Dialog>
  )
}
