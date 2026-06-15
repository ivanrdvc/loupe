import { Brain, FileSearch, type LucideIcon, Network } from 'lucide-react'
import type { Span } from '#/lib/spans'
import { ACCENT, type AccentFamily, toolTone } from '#/lib/tone'

// Operation → accent family; tree tags and timeline bars both derive from this.
export const SPAN_FAMILY: Record<string, AccentFamily> = {
  invoke_agent: 'emerald',
  chat: 'violet',
  tool: 'sky',
  mcp: 'sky',
  retrieval: 'emerald',
  embedding: 'cyan',
}

export interface Display {
  name: string
  tagLabel: string
  tagIcon?: LucideIcon
  tagColor?: string
  /** Optional secondary badge for operation purpose (e.g. "title", "summary") */
  purposeLabel?: string
  purposeCls?: string
}

const SPAN_TAGS: Record<string, { tagLabel: string; tagIcon: LucideIcon; tagColor: string }> = {
  invoke_agent: { tagLabel: 'agent', tagIcon: toolTone('agent').icon, tagColor: ACCENT[SPAN_FAMILY.invoke_agent].text },
  chat: { tagLabel: 'llm', tagIcon: Brain, tagColor: ACCENT[SPAN_FAMILY.chat].text },
  tool: { tagLabel: 'tool', tagIcon: toolTone('tool').icon, tagColor: ACCENT[SPAN_FAMILY.tool].text },
  mcp: { tagLabel: 'mcp', tagIcon: toolTone('mcp').icon, tagColor: ACCENT[SPAN_FAMILY.mcp].text },
  retrieval: { tagLabel: 'retrieval', tagIcon: FileSearch, tagColor: ACCENT[SPAN_FAMILY.retrieval].text },
  embedding: { tagLabel: 'embedding', tagIcon: Network, tagColor: ACCENT[SPAN_FAMILY.embedding].text },
}

const OPERATION_LABELS: Record<string, string> = {
  title_generation: 'title',
  summarization: 'summary',
  artifact_resolution: 'artifact',
  event_resolution: 'event',
  memory_classification: 'memory',
  questionnaire_classification: 'survey',
  memory_contradiction: 'conflict',
  thread_summarization: 'summary',
  memory_extraction: 'extract',
}

const PURPOSE_CLS = ACCENT.amber.badge

export function displayFor(span: Span, labelOverrides?: Map<string, string>): Display {
  const tag = SPAN_TAGS[span.operation]
  const opLabel = span.operationName ? (OPERATION_LABELS[span.operationName] ?? span.operationName) : undefined
  const overridden = labelOverrides?.get(span.id)
  return {
    name: overridden ?? span.toolName ?? span.agentName ?? span.name,
    tagLabel: tag?.tagLabel ?? '',
    tagIcon: tag?.tagIcon,
    tagColor: tag?.tagColor,
    purposeLabel: opLabel,
    purposeCls: opLabel ? PURPOSE_CLS : undefined,
  }
}

export function formatDuration(ms: number): string {
  if (ms < 1) return '<1ms'
  if (ms < 1000) return `${Math.round(ms)}ms`
  return `${(ms / 1000).toFixed(2)}s`
}

export function fmtNum(n: number | undefined): string {
  if (n == null) return '0'
  return n.toLocaleString('en-US')
}
