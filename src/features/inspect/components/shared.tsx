import { AiBrain01Icon } from '@hugeicons/core-free-icons'
import type { IconSvgElement } from '@hugeicons/react'
import type { Span } from '#/lib/spans'
import { toolTone } from '#/lib/tools'

export interface Display {
  name: string
  tagLabel: string
  tagIcon?: IconSvgElement
  tagColor?: string
  /** Optional secondary badge for operation purpose (e.g. "title", "summary") */
  purposeLabel?: string
  purposeCls?: string
}

const SPAN_TAGS: Record<string, { tagLabel: string; tagIcon: IconSvgElement; tagColor: string }> = {
  invoke_agent: { tagLabel: 'agent', tagIcon: toolTone('agent').icon, tagColor: toolTone('agent').text },
  chat: { tagLabel: 'llm', tagIcon: AiBrain01Icon, tagColor: 'text-violet-500 dark:text-violet-400' },
  tool: { tagLabel: 'tool', tagIcon: toolTone('tool').icon, tagColor: toolTone('tool').text },
  mcp: { tagLabel: 'mcp', tagIcon: toolTone('mcp').icon, tagColor: toolTone('mcp').text },
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

const PURPOSE_CLS = 'bg-amber-500/15 text-amber-700 dark:text-amber-300'

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
  return n.toLocaleString()
}
