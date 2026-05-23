import { Loading03Icon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { IconMaximize, IconShare2, IconX } from '@tabler/icons-react'
import { Link } from '@tanstack/react-router'
import { useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'
import { type AutoRefreshInterval, DRAWER_AUTO_REFRESH_OPTIONS } from '#/components/auto-refresh-select'
import { ContextWindow } from '#/components/context-window'
import { ConversationView } from '#/components/conversation-view'
import { CopyButton } from '#/components/copy-button'
import { Button } from '#/components/ui/button'
import { Sheet, SheetClose, SheetContent, SheetDescription, SheetTitle } from '#/components/ui/sheet'
import { Tooltip, TooltipContent, TooltipTrigger } from '#/components/ui/tooltip'
import type { Span } from '#/lib/spans'
import { categorizeFromSpans } from '#/lib/telemetry/trace-category'
import { serialize, type TimeRange } from '#/lib/time-range'
import { SessionInspectLayout } from './overview'
import { useSessionInspectorShortcuts } from './use-shortcuts'
import { useSpanSearch } from './use-span-search'
import { type SessionInspectView, SessionViewBar } from './view-bar'

export { SESSION_VIEW_TABS, type SessionInspectView } from './view-bar'

type DrawerView = SessionInspectView

const DRAWER_TRANSITION_MS = 200

interface SessionInspectDrawerProps {
  open: boolean
  onClose: () => void
  spans: Span[]
  loading?: boolean
  title?: string
  /** Builds in-app expand target: `/sessions/:id` with `view`, optional `span`, and `range`. */
  expandSession?: { sessionId: string; range: TimeRange }
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
  const [fullSpans, setFullSpans] = useState(false)

  useSpanSearch({
    spans: open ? spans : [],
    fullSpans,
    onSelect: (id) => {
      setSelectedId(id)
      setDrawerView('spans')
    },
  })

  const category = useMemo(() => (spans.length > 0 ? categorizeFromSpans(spans) : undefined), [spans])
  const isUtility = category === 'utility'
  const hiddenTabs = useMemo<SessionInspectView[] | undefined>(
    () => (isUtility ? ['conversation'] : undefined),
    [isUtility],
  )

  const expandSearch = useMemo(() => {
    if (!expandSession) return undefined
    const next: { range: TimeRange; view: SessionInspectView; span?: string } = {
      range: expandSession.range,
      view: drawerView,
    }
    if (drawerView === 'spans' && selectedId) next.span = selectedId
    return next
  }, [expandSession, drawerView, selectedId])

  const shareUrl = useMemo(() => {
    if (typeof window === 'undefined' || !expandSession || !expandSearch) return ''
    const params = new URLSearchParams()
    params.set('range', serialize(expandSearch.range))
    params.set('view', expandSearch.view)
    if (expandSearch.span) params.set('span', expandSearch.span)
    return `${window.location.origin}/sessions/${encodeURIComponent(expandSession.sessionId)}?${params.toString()}`
  }, [expandSession, expandSearch])

  // biome-ignore lint/correctness/useExhaustiveDependencies: keyed reset when the previewed session identity changes while the drawer stays mounted
  useEffect(() => {
    setSelectedId(null)
    setDrawerView('spans')
  }, [inspectSessionKey])

  // Auto-select the single chat span for utility traces so the detail panel opens immediately.
  useEffect(() => {
    if (!isUtility || selectedId) return
    const chatSpan = spans.find((s) => s.operation === 'chat')
    if (chatSpan) setSelectedId(chatSpan.id)
  }, [isUtility, spans, selectedId])

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

  useSessionInspectorShortcuts({
    sessionId: title ?? null,
    link: shareUrl || undefined,
    enabled: open && contentReady,
  })

  return (
    <Sheet open={open} onOpenChange={(next) => !next && onClose()}>
      <SheetContent
        side="right"
        showCloseButton={false}
        className="w-full gap-0 bg-background p-0 text-foreground data-[side=right]:sm:max-w-[70vw]"
        onPointerDownOutside={(e) => {
          // Radix's inside-the-dialog detection (isPointerInsideReactTreeRef via
          // onPointerDownCapture) gets out of sync once react-resizable-panels
          // remounts panel children during a drag, so it mis-flags subsequent
          // in-drawer clicks as outside. Only dismiss for actual backdrop clicks.
          if (!(e.target as HTMLElement | null)?.closest('[data-slot="sheet-overlay"]')) {
            e.preventDefault()
          }
        }}
        onInteractOutside={(e) => {
          if (!(e.target as HTMLElement | null)?.closest('[data-slot="sheet-overlay"]')) {
            e.preventDefault()
          }
        }}
      >
        <header className="flex items-center justify-between gap-3 border-b px-4 py-2">
          <div className="flex min-w-0 items-center gap-2">
            <SheetTitle className="sr-only">Session</SheetTitle>
            <SheetDescription className="sr-only">
              Inspect spans, conversation, and context for the selected session.
            </SheetDescription>
            {title && (
              <>
                <span className="truncate font-mono text-xs text-muted-foreground">{title}</span>
                <CopyButton value={title} label="Copy session id" />
              </>
            )}
          </div>
          <div className="flex shrink-0 items-center gap-1">
            {shareUrl && <ShareLinkButton url={shareUrl} />}
            {expandSession && expandSearch && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button asChild variant="ghost" size="icon-sm" aria-label="Open in full page">
                    <Link
                      to="/sessions/$sessionId"
                      params={{ sessionId: expandSession.sessionId }}
                      search={expandSearch}
                      onClick={() => onClose()}
                    >
                      <IconMaximize />
                    </Link>
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Open in full page</TooltipContent>
              </Tooltip>
            )}
            <SheetClose asChild>
              <Button variant="ghost" size="icon-sm" aria-label="Close">
                <IconX />
              </Button>
            </SheetClose>
          </div>
        </header>

        <SessionViewBar
          view={drawerView}
          onViewChange={setDrawerView}
          fullSpans={fullSpans}
          onFullSpansChange={setFullSpans}
          autoRefresh={autoRefresh}
          onAutoRefreshChange={onAutoRefreshChange}
          onRefresh={onRefresh}
          refreshing={refreshing}
          autoRefreshOptions={DRAWER_AUTO_REFRESH_OPTIONS}
          hiddenTabs={hiddenTabs}
          extras={
            contentReady && drawerView === 'conversation' && spans.length > 0 ? <ContextWindow spans={spans} /> : null
          }
        />

        <div className="flex min-h-0 flex-1 flex-col">
          {drawerView === 'conversation' ? (
            <section className="min-h-0 flex-1 overflow-hidden">
              {!contentReady || (loading && spans.length === 0) ? (
                <div className="flex h-full items-center justify-center text-xs text-muted-foreground">
                  <HugeiconsIcon icon={Loading03Icon} strokeWidth={2} className="size-3.5 animate-spin" />
                </div>
              ) : (
                <ConversationView spans={spans} onSelect={setSelectedId} />
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
                fullSpans={fullSpans}
              />
            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  )
}

function ShareLinkButton({ url }: { url: string }) {
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url)
      toast.success('Link copied')
    } catch {
      toast.error('Could not copy')
    }
  }

  return (
    <Button type="button" variant="outline" size="sm" onClick={copy}>
      <IconShare2 />
      Share Link
    </Button>
  )
}
