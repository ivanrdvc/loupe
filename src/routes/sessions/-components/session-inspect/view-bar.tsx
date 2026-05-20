import { ChatBubbleLeftRightIcon, ClipboardDocumentListIcon, QueueListIcon } from '@heroicons/react/24/outline'
import { IconBraces, IconSearch } from '@tabler/icons-react'
import type { ReactNode } from 'react'
import { type AutoRefreshInterval, AutoRefreshSelect } from '#/components/auto-refresh-select'
import { IconTabs } from '#/components/icon-tabs'
import { Button } from '#/components/ui/button'
import { Separator } from '#/components/ui/separator'
import { Toggle } from '#/components/ui/toggle'
import { Tooltip, TooltipContent, TooltipTrigger } from '#/components/ui/tooltip'

export type SessionInspectView = 'spans' | 'conversation' | 'context'

export const SESSION_VIEW_TABS = [
  { id: 'spans', label: 'Spans', Icon: QueueListIcon },
  { id: 'conversation', label: 'Conversation', Icon: ChatBubbleLeftRightIcon },
  { id: 'context', label: 'Context', Icon: ClipboardDocumentListIcon },
] as const

interface SessionViewBarProps {
  view: SessionInspectView
  onViewChange: (view: SessionInspectView) => void
  fullSpans?: boolean
  onFullSpansChange?: (value: boolean) => void
  onOpenPalette?: () => void
  autoRefresh?: AutoRefreshInterval
  onAutoRefreshChange?: (value: AutoRefreshInterval) => void
  onRefresh?: () => void
  refreshing?: boolean
  autoRefreshOptions?: readonly AutoRefreshInterval[]
  /** Extra actions rendered to the right of the standard cluster (e.g. ContextWindow). */
  extras?: ReactNode
  /** Tab ids to hide from the view bar (e.g. hide Conversation for utility traces). */
  hiddenTabs?: SessionInspectView[]
}

export function SessionViewBar({
  view,
  onViewChange,
  fullSpans,
  onFullSpansChange,
  onOpenPalette,
  autoRefresh,
  onAutoRefreshChange,
  onRefresh,
  refreshing,
  autoRefreshOptions,
  extras,
  hiddenTabs,
}: SessionViewBarProps) {
  const visibleTabs = hiddenTabs?.length
    ? SESSION_VIEW_TABS.filter((t) => !hiddenTabs.includes(t.id))
    : SESSION_VIEW_TABS
  const showSpansActions = view === 'spans'
  const hasModifierGroup = showSpansActions && (onOpenPalette || onFullSpansChange)
  const hasActionGroup = (autoRefresh != null && onAutoRefreshChange != null && onRefresh != null) || extras != null
  return (
    <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-b bg-muted/30 px-4 py-2">
      <IconTabs tabs={visibleTabs} value={view} onChange={onViewChange} aria-label="Session view" />
      <div className="flex flex-wrap items-center gap-1">
        {showSpansActions && onOpenPalette && (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="ghost" size="icon-sm" aria-label="Jump to span" onClick={onOpenPalette}>
                <IconSearch />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Jump to span (⌘K)</TooltipContent>
          </Tooltip>
        )}
        {showSpansActions && onFullSpansChange && (
          <Tooltip>
            <TooltipTrigger asChild>
              <Toggle size="sm" pressed={fullSpans} onPressedChange={onFullSpansChange} aria-label="Show raw spans">
                <IconBraces />
              </Toggle>
            </TooltipTrigger>
            <TooltipContent>{fullSpans ? 'Hide raw spans' : 'Show raw spans'}</TooltipContent>
          </Tooltip>
        )}
        {hasModifierGroup && hasActionGroup && <Separator orientation="vertical" className="mx-1 h-5" />}
        {autoRefresh != null && onAutoRefreshChange != null && onRefresh != null && (
          <AutoRefreshSelect
            value={autoRefresh}
            onChange={onAutoRefreshChange}
            onRefresh={onRefresh}
            loading={refreshing}
            options={autoRefreshOptions}
          />
        )}
        {extras}
      </div>
    </div>
  )
}
