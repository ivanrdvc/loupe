import { describe, expect, it } from 'vitest'
import { computeContextSegments } from './context-segments'

describe('computeContextSegments', () => {
  it('returns segments in the fixed order: system, tools, messages, subagents', () => {
    const segments = computeContextSegments({
      systemTokens: 100,
      toolDefsTokens: 200,
      messagesTokens: 300,
      subagentTokens: 400,
    })
    expect(segments.map((s) => s.key)).toEqual(['system', 'tools', 'messages', 'subagents'])
  })

  it('rounds percentages to whole numbers based on the sum of all segments', () => {
    // Total = 16_000 + 1_000 = 17_000. Tools = 94.117…% → 94; Messages = 5.88% → 6.
    const segments = computeContextSegments({
      systemTokens: 0,
      toolDefsTokens: 16000,
      messagesTokens: 1000,
      subagentTokens: 0,
    })
    expect(segments).toEqual([
      { key: 'system', label: 'System', tokens: 0, pct: 0 },
      { key: 'tools', label: 'Tools', tokens: 16000, pct: 94 },
      { key: 'messages', label: 'Messages', tokens: 1000, pct: 6 },
      { key: 'subagents', label: 'Subagents', tokens: 0, pct: 0 },
    ])
  })

  it('treats zero-token segments as 0% even when the bar is empty', () => {
    const segments = computeContextSegments({
      systemTokens: 0,
      toolDefsTokens: 0,
      messagesTokens: 0,
      subagentTokens: 0,
    })
    for (const s of segments) {
      expect(s.tokens).toBe(0)
      expect(s.pct).toBe(0)
    }
  })

  it('handles a single populated segment as 100%', () => {
    const segments = computeContextSegments({
      systemTokens: 1234,
      toolDefsTokens: 0,
      messagesTokens: 0,
      subagentTokens: 0,
    })
    expect(segments[0]).toEqual({ key: 'system', label: 'System', tokens: 1234, pct: 100 })
  })
})
