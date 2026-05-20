import type { Span } from '../spans'
import type { TraceCategory } from './types'

// Trigger and purpose come from the root span only; structural markers (counts → booleans)
// describe shape. A nested utility LLM never flips the whole trace's category.
export interface TraceClassificationInput {
  hasInvokeAgent: boolean
  hasChat: boolean
  hasRootExecuteTool: boolean
  hasSessionAttribute: boolean
  rootTriggerType?: string
  rootExecution?: string
  rootLlmPurpose?: string
}

export function classifyTraceCategory(input: TraceClassificationInput): TraceCategory {
  switch (input.rootTriggerType) {
    case 'scheduled':
      return 'scheduled'
    case 'webhook':
      return 'webhook'
    case 'user':
      if (input.rootExecution === 'background') return 'background'
      break
  }
  if (input.hasRootExecuteTool && input.hasInvokeAgent) return 'sub-agent'
  if (input.hasInvokeAgent) return 'chat'
  if (input.rootLlmPurpose) return 'utility'
  if (input.hasSessionAttribute) return 'chat'
  if (input.hasChat) return 'utility'
  return 'orphan'
}

/** Derive the trace category from an already-loaded span array (client-side). */
export function categorizeFromSpans(spans: Span[]): TraceCategory {
  const root = spans.find((s) => s.parentId === null)
  return classifyTraceCategory({
    hasInvokeAgent: spans.some((s) => s.operation === 'invoke_agent'),
    hasChat: spans.some((s) => s.operation === 'chat'),
    hasRootExecuteTool: root?.operation === 'tool',
    hasSessionAttribute: spans.some((s) => s.sessionSource === 'attribute'),
    // TODO: verify operationName only set from purpose attr
    rootLlmPurpose: root?.operationName,
  })
}
