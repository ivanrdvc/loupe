import { ChatBubbleLeftRightIcon, QueueListIcon } from '@heroicons/react/24/outline'
import { IconBraces } from '@tabler/icons-react'
import type { ReactNode } from 'react'
import {
  type AutoRefreshInterval,
  AutoRefreshSelect,
  INSPECT_AUTO_REFRESH_OPTIONS,
} from '#/components/auto-refresh-select'
import { IconTabs } from '#/components/icon-tabs'
import { Separator } from '#/components/ui/separator'
import { Toggle } from '#/components/ui/toggle'
import { Tooltip, TooltipContent, TooltipTrigger } from '#/components/ui/tooltip'

export type InspectView = 'spans' | 'conversation'

const INSPECT_VIEW_TABS = [
  { id: 'spans', label: 'Spans', Icon: QueueListIcon },
  { id: 'conversation', label: 'Conversation', Icon: ChatBubbleLeftRightIcon },
] as const

interface InspectViewBarProps {
  view: InspectView
  onViewChange: (view: InspectView) => void
  /** Bulk raw-spans control across every trace in the session. Per-row toggles
   * still work independently — this just flips them all together. */
  rawAllOn?: boolean
  onToggleRawAll?: () => void
  autoRefresh?: AutoRefreshInterval
  onAutoRefreshChange?: (value: AutoRefreshInterval) => void
  onRefresh?: () => void
  refreshing?: boolean
  /** Extra actions rendered to the right of the standard cluster (e.g. ContextWindow). */
  extras?: ReactNode
  /** Tab ids to hide from the view bar (e.g. hide Conversation for utility traces). */
  hiddenTabs?: InspectView[]
}

export function InspectViewBar({
  view,
  onViewChange,
  rawAllOn,
  onToggleRawAll,
  autoRefresh,
  onAutoRefreshChange,
  onRefresh,
  refreshing,
  extras,
  hiddenTabs,
}: InspectViewBarProps) {
  const visibleTabs = hiddenTabs?.length
    ? INSPECT_VIEW_TABS.filter((t) => !hiddenTabs.includes(t.id))
    : INSPECT_VIEW_TABS
  const showRawAll = view === 'spans' && onToggleRawAll
  const hasRefreshGroup = autoRefresh != null && onAutoRefreshChange != null && onRefresh != null
  return (
    <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-b bg-muted/30 px-4 py-2">
      <IconTabs tabs={visibleTabs} value={view} onChange={onViewChange} aria-label="Inspect view" />
      <div className="flex flex-wrap items-center gap-1">
        {showRawAll && (
          <Tooltip>
            <TooltipTrigger asChild>
              <Toggle
                size="sm"
                pressed={rawAllOn}
                onPressedChange={onToggleRawAll}
                aria-label="Toggle raw spans on every trace"
              >
                <IconBraces />
              </Toggle>
            </TooltipTrigger>
            <TooltipContent>
              {rawAllOn ? 'Close raw spans on every trace' : 'Open raw spans on every trace'}
            </TooltipContent>
          </Tooltip>
        )}
        {showRawAll && (hasRefreshGroup || extras != null) && <Separator orientation="vertical" className="mx-1 h-5" />}
        {hasRefreshGroup && (
          <AutoRefreshSelect
            value={autoRefresh}
            onChange={onAutoRefreshChange}
            onRefresh={onRefresh}
            loading={refreshing}
            options={INSPECT_AUTO_REFRESH_OPTIONS}
          />
        )}
        {extras}
      </div>
    </div>
  )
}
