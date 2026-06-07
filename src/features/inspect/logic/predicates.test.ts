import { describe, expect, it } from 'vitest'
import type { Span } from '#/lib/spans'
import { isAgentSpan, isChatSpan, isCollapsibleInfra, isLlmLike, isToolLike, spanHasError } from './predicates'

function span(over: Partial<Span> & Pick<Span, 'operation'>): Span {
  return {
    id: 'x',
    traceId: 't',
    parentId: null,
    service: 's',
    kind: 'internal',
    name: 'n',
    startMs: 0,
    endMs: 0,
    ...over,
  }
}

describe('predicates', () => {
  it('isChatSpan / isAgentSpan flag their operation exactly', () => {
    expect(isChatSpan(span({ operation: 'chat' }))).toBe(true)
    expect(isChatSpan(span({ operation: 'tool' }))).toBe(false)
    expect(isAgentSpan(span({ operation: 'invoke_agent' }))).toBe(true)
    expect(isAgentSpan(span({ operation: 'chat' }))).toBe(false)
  })

  it('isToolLike covers both tool and mcp', () => {
    expect(isToolLike(span({ operation: 'tool' }))).toBe(true)
    expect(isToolLike(span({ operation: 'mcp' }))).toBe(true)
    expect(isToolLike(span({ operation: 'chat' }))).toBe(false)
  })

  it('isCollapsibleInfra targets http and mcp (transport noise hidden by default)', () => {
    expect(isCollapsibleInfra(span({ operation: 'http' }))).toBe(true)
    expect(isCollapsibleInfra(span({ operation: 'mcp' }))).toBe(true)
    expect(isCollapsibleInfra(span({ operation: 'tool' }))).toBe(false)
    expect(isCollapsibleInfra(span({ operation: 'chat' }))).toBe(false)
    expect(isCollapsibleInfra(span({ operation: 'invoke_agent' }))).toBe(false)
  })

  it('isLlmLike treats chat spans as LLM', () => {
    expect(isLlmLike(span({ operation: 'chat' }))).toBe(true)
  })

  it('isLlmLike treats non-chat spans with model or llmInput/llmOutput as LLM', () => {
    expect(isLlmLike(span({ operation: 'invoke_agent', model: 'gpt-4o' }))).toBe(true)
    expect(isLlmLike(span({ operation: 'invoke_agent', llmInput: 'hi' }))).toBe(true)
    expect(isLlmLike(span({ operation: 'invoke_agent', llmOutput: 'hi' }))).toBe(true)
  })

  it('isLlmLike rejects plain non-chat spans', () => {
    expect(isLlmLike(span({ operation: 'tool' }))).toBe(false)
    expect(isLlmLike(span({ operation: 'http' }))).toBe(false)
  })
})

describe('spanHasError', () => {
  it('returns true when hasError is set', () => {
    expect(spanHasError(span({ operation: 'chat', hasError: true }))).toBe(true)
  })

  it('detects tool failures encoded in toolResult', () => {
    expect(spanHasError(span({ operation: 'tool', toolResult: { error: true } }))).toBe(true)
    expect(spanHasError(span({ operation: 'tool', toolResult: { status: 'error' } }))).toBe(true)
  })

  it('recognizes Anthropic/MCP is_error and isError payloads', () => {
    expect(spanHasError(span({ operation: 'tool', toolResult: { is_error: true } }))).toBe(true)
    expect(spanHasError(span({ operation: 'tool', toolResult: { isError: true } }))).toBe(true)
  })

  it('treats errorType without span_status=ERROR as errored (matches the tool card)', () => {
    expect(spanHasError(span({ operation: 'tool', errorType: 'RuntimeError' }))).toBe(true)
  })

  it('returns false for non-error tool results', () => {
    expect(spanHasError(span({ operation: 'tool', toolResult: { ok: true } }))).toBe(false)
    expect(spanHasError(span({ operation: 'tool', toolResult: 'plain string' }))).toBe(false)
    expect(spanHasError(span({ operation: 'tool', toolResult: [1, 2, 3] }))).toBe(false)
  })

  it('returns false when no error markers are present', () => {
    expect(spanHasError(span({ operation: 'chat' }))).toBe(false)
  })
})
