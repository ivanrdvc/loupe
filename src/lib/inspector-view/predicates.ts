import type { Span } from '#/lib/spans'

export const isChatSpan = (s: Span): boolean => s.operation === 'chat'
export const isAgentSpan = (s: Span): boolean => s.operation === 'invoke_agent'
// Tool execution — covers MCP, which is a tool call in disguise.
export const isToolLike = (s: Span): boolean => s.operation === 'tool' || s.operation === 'mcp'
// Transport noise hidden by default in the tree and span palette.
export const isCollapsibleInfra = (s: Span): boolean => s.operation === 'http' || s.operation === 'mcp'

// LLM-ish: has model/io even if its operation isn't strictly `chat` (some
// providers emit invoke_agent with llm_input/output attached).
export const isLlmLike = (s: Span): boolean =>
  isChatSpan(s) || s.llmInput != null || s.llmOutput != null || Boolean(s.model)

// Tool failures don't always set hasError — the failure sits in toolResult.
export function spanHasError(span: Span): boolean {
  if (span.hasError) return true
  const r = span.toolResult
  if (!r || typeof r !== 'object' || Array.isArray(r)) return false
  return r.error === true || r.status === 'error'
}
