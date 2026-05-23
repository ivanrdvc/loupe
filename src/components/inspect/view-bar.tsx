import { ChatBubbleLeftRightIcon, QueueListIcon } from '@heroicons/react/24/outline'
import { IconBraces } from '@tabler/icons-react'
import type { ReactNode } from 'react'
import { type AutoRefreshInterval, AutoRefreshSelect } from '#/components/auto-refresh-select'
import { IconTabs } from '#/components/icon-tabs'
import { Separator } from '#/components/ui/separator'
import { Toggle } from '#/components/ui/toggle'
import { Tooltip, TooltipContent, TooltipTrigger } from '#/components/ui/tooltip'

export type InspectView = 'spans' | 'conversation'

export const INSPECT_VIEW_TABS = [
  { id: 'spans', label: 'Spans', Icon: QueueListIcon },
  { id: 'conversation', label: 'Conversation', Icon: ChatBubbleLeftRightIcon },
] as const

interface InspectViewBarProps {
  view: InspectView
  onViewChange: (view: InspectView) => void
  fullSpans?: boolean
  onFullSpansChange?: (value: boolean) => void
  autoRefresh?: AutoRefreshInterval
  onAutoRefreshChange?: (value: AutoRefreshInterval) => void
  onRefresh?: () => void
  refreshing?: boolean
  autoRefreshOptions?: readonly AutoRefreshInterval[]
  /** Extra actions rendered to the right of the standard cluster (e.g. ContextWindow). */
  extras?: ReactNode
  /** Tab ids to hide from the view bar (e.g. hide Conversation for utility traces). */
  hiddenTabs?: InspectView[]
}

export function InspectViewBar({
  view,
  onViewChange,
  fullSpans,
  onFullSpansChange,
  autoRefresh,
  onAutoRefreshChange,
  onRefresh,
  refreshing,
  autoRefreshOptions,
  extras,
  hiddenTabs,
}: InspectViewBarProps) {
  const visibleTabs = hiddenTabs?.length
    ? INSPECT_VIEW_TABS.filter((t) => !hiddenTabs.includes(t.id))
    : INSPECT_VIEW_TABS
  const showSpansActions = view === 'spans'
  const hasModifierGroup = showSpansActions && onFullSpansChange
  const hasActionGroup = (autoRefresh != null && onAutoRefreshChange != null && onRefresh != null) || extras != null
  return (
    <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-b bg-muted/30 px-4 py-2">
      <IconTabs tabs={visibleTabs} value={view} onChange={onViewChange} aria-label="Inspect view" />
      <div className="flex flex-wrap items-center gap-1">
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
