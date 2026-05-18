import type { Span } from '#/lib/spans'

export interface Display {
  name: string
  tagLabel: string
  tagCls: string
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
}

export function displayFor(span: Span): Display {
  const tag = SPAN_TAGS[span.operation]
  const opLabel = span.operationName ? (OPERATION_LABELS[span.operationName] ?? span.operationName) : undefined
  return {
    name: span.toolName ?? span.agentName ?? span.name,
    tagLabel: opLabel ?? tag?.tagLabel ?? '',
    tagCls: tag?.tagCls ?? '',
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
