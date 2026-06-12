import type { Span } from '#/lib/spans'
import { toolError } from '#/lib/spans/conversation'

export const isChatSpan = (s: Span): boolean => s.operation === 'chat'
export const isAgentSpan = (s: Span): boolean => s.operation === 'invoke_agent'
// Tool execution — covers MCP, which is a tool call in disguise.
export const isToolLike = (s: Span): boolean => s.operation === 'tool' || s.operation === 'mcp'
// Transport noise hidden by default in the tree and span palette.
export const isCollapsibleInfra = (s: Span): boolean => s.operation === 'http' || s.operation === 'mcp'

// One source of truth with the tool card / tool_result.success.
export const spanHasError = (span: Span): boolean => toolError(span) !== undefined
