import { HugeiconsIcon } from '@hugeicons/react'
import { useMemo } from 'react'
import { type SearchProvider, useRegisterSearchProvider } from '#/components/command-palette'
import { Badge } from '#/components/ui/badge'
import { type InspectorView, isCollapsibleInfra } from '#/features/inspect/logic'
import { displayFor } from './shared'

export function useSpanSearch({ view, onSelect }: { view: InspectorView; onSelect: (id: string) => void }) {
  const provider = useMemo<SearchProvider | null>(() => {
    if (view.spans.length === 0) return null
    const { spans, byId, agentLabels } = view
    // Palette skips infra (http/mcp) spans so search stays focused on meaningful
    // nodes. Per-trace raw toggle in the tree is the way to see them.
    const visible = spans.filter((s) => !isCollapsibleInfra(s))
    return {
      id: 'session-spans',
      group: 'Spans in this session',
      exclusive: true,
      items: visible.map((span) => {
        const parent = span.parentId ? byId.get(span.parentId) : undefined
        const display = displayFor(span, agentLabels)
        const parentDisplay = parent ? displayFor(parent, agentLabels) : undefined
        return {
          id: span.id,
          label: display.name,
          keywords: `${display.tagLabel} ${display.purposeLabel ?? ''} ${parentDisplay?.name ?? ''} ${span.model ?? ''}`,
          leading: display.tagLabel ? (
            <Badge variant="outline" className="px-1.5 text-muted-foreground">
              {display.tagIcon && (
                <HugeiconsIcon
                  icon={display.tagIcon}
                  strokeWidth={1.5}
                  className={`size-3 ${display.tagColor ?? ''}`}
                  aria-hidden
                />
              )}
              {display.tagLabel}
            </Badge>
          ) : undefined,
          trailing: (
            <>
              {display.purposeLabel && (
                <span className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] font-medium ${display.purposeCls}`}>
                  {display.purposeLabel}
                </span>
              )}
              {parentDisplay?.name && (
                <span className="ml-auto shrink-0 truncate text-[11px] text-muted-foreground">
                  in {parentDisplay.name}
                </span>
              )}
            </>
          ),
          onSelect: () => onSelect(span.id),
        }
      }),
    }
  }, [view, onSelect])

  useRegisterSearchProvider(provider)
}
