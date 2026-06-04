import type { Span } from '../spans'
import type { TraceCategory } from './types'

// Trigger and purpose come from the root span only. `rootOperation` is the
// root span's OTel operation name (e.g. "execute_tool explore", "invoke_agent
// ProverbsAgent"); sub-agent identity follows from it starting with
// `execute_tool ` per the convention spec.
export interface TraceClassificationInput {
  hasInvokeAgent: boolean
  hasChat: boolean
  hasSessionAttribute: boolean
  rootOperation?: string
  rootTriggerType?: string
  rootExecution?: string
  rootLlmPurpose?: string
}

export function classifyTraceCategory(input: TraceClassificationInput): TraceCategory {
  switch (input.rootTriggerType) {
    case 'scheduled':
      return 'scheduled'
    case 'event':
      return 'event'
    case 'webhook':
      return 'webhook'
    case 'user':
      if (input.rootExecution === 'background') return 'background'
      break
  }
  if (input.rootOperation?.startsWith('execute_tool ') && input.hasInvokeAgent) return 'sub-agent'
  if (input.hasInvokeAgent) return 'chat'
  if (input.rootLlmPurpose) return 'utility'
  if (input.hasSessionAttribute) return 'chat'
  // Bare chat (no purpose) is orphan, not utility — spec: utility ⇔ purpose set.
  return 'orphan'
}

/** Derive the trace category from an already-loaded span array (client-side). */
export function categorizeFromSpans(spans: Span[]): TraceCategory {
  const root = spans.find((s) => s.parentId === null)
  return classifyTraceCategory({
    hasInvokeAgent: spans.some((s) => s.operation === 'invoke_agent'),
    hasChat: spans.some((s) => s.operation === 'chat'),
    hasSessionAttribute: spans.some((s) => s.sessionSource === 'attribute'),
    rootOperation: root?.name,
    rootLlmPurpose: root?.operationName,
  })
}
