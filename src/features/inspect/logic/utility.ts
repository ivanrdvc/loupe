import type { Span } from '#/lib/spans'
import { categorizeFromSpans } from '#/lib/telemetry/trace-category'
import type { InspectView } from '../components/view-bar'

export interface UtilityInspect {
  hiddenTabs: InspectView[]
  chatSpanId?: string
}

// Utility traces have no conversation: hide that tab and point at the chat
// span so the detail panel opens immediately. Callers apply it their own way
// (drawer via setSelectedId, session page via navigate).
export function utilityInspect(spans: Span[]): UtilityInspect | null {
  if (categorizeFromSpans(spans) !== 'utility') return null
  return { hiddenTabs: ['conversation'], chatSpanId: spans.find((s) => s.operation === 'chat')?.id }
}
