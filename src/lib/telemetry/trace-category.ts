import type { TraceCategory } from './types'

export interface TraceClassificationInput {
  hasSessionAttribute: boolean
  hasRootExecuteTool: boolean
  invokeAgentCount: number
  chatCount: number
  triggerType?: string
  execution?: string
  llmPurpose?: string
}

export function classifyTraceCategory(input: TraceClassificationInput): TraceCategory {
  if (input.hasRootExecuteTool && input.invokeAgentCount > 0) return 'sub-agent'
  switch (input.triggerType) {
    case 'scheduled':
      return 'scheduled'
    case 'webhook':
      return 'webhook'
    case 'user':
      if (input.execution === 'background') return 'background'
      break
  }
  if (input.hasSessionAttribute) return 'chat'
  if (input.llmPurpose) return 'utility'
  if (input.chatCount > 0 && input.invokeAgentCount === 0) return 'utility'
  return 'orphan'
}
