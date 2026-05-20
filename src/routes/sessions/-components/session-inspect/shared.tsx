import type { Span } from '#/lib/spans'

export interface Display {
  name: string
  tagLabel: string
  tagCls: string
  /** Optional secondary badge for operation purpose (e.g. "title", "summary") */
  purposeLabel?: string
  purposeCls?: string
}

export const SPAN_TAGS: Record<string, { tagLabel: string; tagCls: string }> = {
  invoke_agent: { tagLabel: 'agent', tagCls: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300' },
  chat: { tagLabel: 'llm', tagCls: 'bg-violet-500/15 text-violet-700 dark:text-violet-300' },
  tool: { tagLabel: 'tool', tagCls: 'bg-sky-500/15 text-sky-700 dark:text-sky-300' },
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
    tagCls: tag?.tagCls ?? '',
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
