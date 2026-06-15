import type { Span } from '#/lib/spans'
import { toolError } from '#/lib/spans/conversation'

export const isChatSpan = (s: Span): boolean => s.operation === 'chat'
export const isAgentSpan = (s: Span): boolean => s.operation === 'invoke_agent'
// Tool execution — covers MCP, which is a tool call in disguise.
export const isToolLike = (s: Span): boolean => s.operation === 'tool' || s.operation === 'mcp'
// Transport noise hidden by default in the tree and span palette.
export const isCollapsibleInfra = (s: Span): boolean => s.operation === 'http' || s.operation === 'mcp'
// The query-embedding nested inside a retrieval span is part of recall, not a
// distinct step — fold it into the retrieval row so recall reads as one node.
export const isNestedQueryEmbedding = (s: Span, parent: Span | undefined): boolean =>
  s.operation === 'embedding' && parent?.operation === 'retrieval'

// One source of truth with the tool card / tool_result.success.
export const spanHasError = (span: Span): boolean => toolError(span) !== undefined
