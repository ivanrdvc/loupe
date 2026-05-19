import { describe, expect, it } from 'vitest'
import { findUtilityChatIds, propagateInheritedAttrs, type Span } from './spans'

function span(overrides: Partial<Span> & Pick<Span, 'id' | 'operation'>): Span {
  return {
    traceId: 't1',
    parentId: null,
    service: 'svc',
    kind: 'internal',
    name: overrides.operation,
    startMs: 0,
    endMs: 100,
    ...overrides,
  }
}

describe('propagateInheritedAttrs', () => {
  it('inherits operationName and agUiRunId from the nearest ancestor', () => {
    const spans: Span[] = [
      span({ id: 'root', operation: 'invoke_agent', operationName: 'title_generation', agUiRunId: 'run-1' }),
      span({ id: 'mid', operation: 'invoke_agent', parentId: 'root' }),
      span({ id: 'leaf', operation: 'chat', parentId: 'mid' }),
    ]
    propagateInheritedAttrs(spans)
    expect(spans[1]).toMatchObject({ operationName: 'title_generation', agUiRunId: 'run-1' })
    expect(spans[2]).toMatchObject({ operationName: 'title_generation', agUiRunId: 'run-1' })
  })

  it('does not overwrite values already set on the span', () => {
    const spans: Span[] = [
      span({ id: 'root', operation: 'invoke_agent', operationName: 'summarization', agUiRunId: 'run-x' }),
      span({ id: 'leaf', operation: 'chat', parentId: 'root', operationName: 'title_generation', agUiRunId: 'run-y' }),
    ]
    propagateInheritedAttrs(spans)
    expect(spans[1]).toMatchObject({ operationName: 'title_generation', agUiRunId: 'run-y' })
  })

  it('handles spans appearing before their parent in the input array', () => {
    const spans: Span[] = [
      span({ id: 'leaf', operation: 'chat', parentId: 'root' }),
      span({ id: 'root', operation: 'invoke_agent', operationName: 'title_generation' }),
    ]
    propagateInheritedAttrs(spans)
    expect(spans[0].operationName).toBe('title_generation')
  })

  it('leaves a span untouched when no ancestor carries the attr', () => {
    const spans: Span[] = [
      span({ id: 'root', operation: 'invoke_agent' }),
      span({ id: 'leaf', operation: 'chat', parentId: 'root' }),
    ]
    propagateInheritedAttrs(spans)
    expect(spans[1].operationName).toBeUndefined()
    expect(spans[1].agUiRunId).toBeUndefined()
  })
})

describe('findUtilityChatIds', () => {
  it('flags chat spans with an explicit operationName', () => {
    const spans: Span[] = [
      span({ id: 'a', operation: 'chat', operationName: 'title_generation' }),
      span({ id: 'b', operation: 'chat' }),
    ]
    expect(findUtilityChatIds(spans)).toEqual(new Set(['a']))
  })

  it('flags AG-UI-trace chats missing an agUiRunId as utility', () => {
    const spans: Span[] = [
      span({ id: 'conv', operation: 'chat', agUiRunId: 'run-1' }),
      span({ id: 'util', operation: 'chat' }),
    ]
    expect(findUtilityChatIds(spans)).toEqual(new Set(['util']))
  })

  it('does not flag missing-runId chats when the trace has no AG-UI spans at all', () => {
    const spans: Span[] = [span({ id: 'chat1', operation: 'chat' }), span({ id: 'chat2', operation: 'chat' })]
    expect(findUtilityChatIds(spans)).toEqual(new Set())
  })

  it('ignores non-chat operations', () => {
    const spans: Span[] = [
      span({ id: 'tool', operation: 'tool', operationName: 'title_generation' }),
      span({ id: 'chat', operation: 'chat', operationName: 'summarization' }),
    ]
    expect(findUtilityChatIds(spans)).toEqual(new Set(['chat']))
  })
})
