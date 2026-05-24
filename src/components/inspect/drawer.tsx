import { Loading03Icon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { IconMaximize, IconShare2, IconX } from '@tabler/icons-react'
import { Link } from '@tanstack/react-router'
import { useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'
import { ContextWindow } from '#/components/context-window'
import { ConversationView } from '#/components/conversation-view'
import { CopyButton } from '#/components/copy-button'
import { Button } from '#/components/ui/button'
import { Sheet, SheetClose, SheetContent, SheetDescription, SheetTitle } from '#/components/ui/sheet'
import { Tooltip, TooltipContent, TooltipTrigger } from '#/components/ui/tooltip'
import type { Span } from '#/lib/spans'
import { categorizeFromSpans } from '#/lib/telemetry/trace-category'
import { serialize, type TimeRange } from '#/lib/time-range'
import { InspectLayout } from './overview'
import { useInspectShortcuts } from './use-shortcuts'
import { useSpanSearch } from './use-span-search'
import { type InspectView, InspectViewBar } from './view-bar'

type DrawerView = InspectView

const DRAWER_TRANSITION_MS = 200

interface InspectDrawerProps {
  open: boolean
  onClose: () => void
  spans: Span[]
  loading?: boolean
  title?: string
  /** Optional service/agent name shown before the ID in the header. */
  service?: string
  /** When true, renders a small error dot before the service name. */
  hasError?: boolean
  /** Builds in-app expand target: `/sessions/:id` with `view`, optional `span`, and `range`. */
  expandSession?: { sessionId: string; range: TimeRange }
  /** Builds in-app expand target: `/traces/:traceId`. */
  expandTrace?: { traceId: string }
  /** Stable id for the inspected entity — resets picker state when it changes while `open`. */
  inspectKey?: string | null
}

export function InspectDrawer({
  open,
  onClose,
  spans,
  loading,
  title,
  service,
  hasError,
  expandSession,
  expandTrace,
  inspectKey,
}: InspectDrawerProps) {
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
  const hiddenTabs = useMemo<InspectView[] | undefined>(() => (isUtility ? ['conversation'] : undefined), [isUtility])

  const expandSearch = useMemo(() => {
    if (!expandSession) return undefined
    const next: { range: TimeRange; view: InspectView; span?: string } = {
      range: expandSession.range,
      view: drawerView,
    }
    if (drawerView === 'spans' && selectedId) next.span = selectedId
    return next
  }, [expandSession, drawerView, selectedId])

  const shareUrl = useMemo(() => {
    if (typeof window === 'undefined') return ''
    if (expandTrace) {
      return `${window.location.origin}/traces/${encodeURIComponent(expandTrace.traceId)}`
    }
    if (!expandSession || !expandSearch) return ''
    const params = new URLSearchParams()
    params.set('range', serialize(expandSearch.range))
    params.set('view', expandSearch.view)
    if (expandSearch.span) params.set('span', expandSearch.span)
    return `${window.location.origin}/sessions/${encodeURIComponent(expandSession.sessionId)}?${params.toString()}`
  }, [expandSession, expandSearch, expandTrace])

  // biome-ignore lint/correctness/useExhaustiveDependencies: keyed reset when the previewed session identity changes while the drawer stays mounted
  useEffect(() => {
    setSelectedId(null)
    setDrawerView('spans')
  }, [inspectKey])

  // Auto-select the single chat span for utility traces so the detail panel opens immediately.
  useEffect(() => {
    if (!isUtility || selectedId) return
    const chatSpan = spans.find((s) => s.operation === 'chat')
    if (chatSpan) setSelectedId(chatSpan.id)
  }, [isUtility, spans, selectedId])

  useEffect(() => {
    let frame = 0
    let timeout = 0
    const hasSession = inspectKey != null

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
  }, [open, inspectKey])

  const showLoading = loading || !contentReady

  useInspectShortcuts({
    entityId: title ?? null,
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
            <SheetTitle className="sr-only">{expandTrace ? 'Trace' : 'Session'}</SheetTitle>
            <SheetDescription className="sr-only">
              Inspect spans, conversation, and context for the selected {expandTrace ? 'trace' : 'session'}.
            </SheetDescription>
            {hasError && (
              <>
                <span className="sr-only">Errored</span>
                <span aria-hidden="true" title="Errored" className="size-2 shrink-0 rounded-full bg-destructive" />
              </>
            )}
            {service && <span className="truncate text-sm font-medium text-foreground">{service}</span>}
            {title && (
              <>
                <span className="truncate font-mono text-xs text-muted-foreground">{title}</span>
                <CopyButton value={title} label="Copy id" />
              </>
            )}
          </div>
          <div className="flex shrink-0 items-center gap-1">
            {shareUrl && <ShareLinkButton url={shareUrl} />}
            {expandTrace ? (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button asChild variant="ghost" size="icon-sm" aria-label="Open in full page">
                    <Link to="/traces/$traceId" params={{ traceId: expandTrace.traceId }} onClick={() => onClose()}>
                      <IconMaximize />
                    </Link>
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Open in full page</TooltipContent>
              </Tooltip>
            ) : expandSession && expandSearch ? (
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
            ) : null}
            <SheetClose asChild>
              <Button variant="ghost" size="icon-sm" aria-label="Close">
                <IconX />
              </Button>
            </SheetClose>
          </div>
        </header>

        <InspectViewBar
          view={drawerView}
          onViewChange={setDrawerView}
          fullSpans={fullSpans}
          onFullSpansChange={setFullSpans}
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
              <InspectLayout
                key={inspectKey ?? undefined}
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
