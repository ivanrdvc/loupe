import { describe, expect, it } from 'vitest'
import raw from './__fixtures__/oo-raw-hits.json'
import { normalizeOpenObserveHit } from './openobserve'

// Real recorded OO hits → Span, pinning the OO-specific extraction seam.
describe('normalizeOpenObserveHit', () => {
  it('maps a chat hit: ns→ms time, client kind, tokens/cost/model/session', () => {
    const s = normalizeOpenObserveHit(raw.chat)
    expect(s.id).toBe('205b45336efe7efc')
    expect(s.traceId).toBe('d180744d35a0660e31f4c207ff52d59d')
    expect(s.parentId).toBe('c6eda740bcf460ad')
    expect(s.service).toBe('Aporia.Cli')
    expect(s.kind).toBe('client')
    expect(s.operation).toBe('chat')
    expect(s.startMs).toBe(1_780_601_600_962)
    expect(s.endMs).toBe(1_780_601_605_941)
    expect(s.model).toBe('claude-haiku-4-5')
    expect(s.tokens).toBe(25253)
    expect(s.inputTokens).toBe(24807)
    expect(s.outputTokens).toBe(446)
    expect(s.costUsd).toBeCloseTo(0.027037, 6)
    expect(s.sessionSource).toBe('attribute')
    expect(s.hasError).toBeUndefined()
    expect(s.rawAttributes).toBe(raw.chat)
  })

  it('maps a tool hit: internal kind, tool name/call-id/params', () => {
    const s = normalizeOpenObserveHit(raw.tool)
    expect(s.operation).toBe('tool')
    expect(s.kind).toBe('internal')
    expect(s.toolName).toBe('FetchFile')
    expect(s.toolCallId).toBe('toolu_011SV3sofYGkx83H6dVocvB3')
    expect(s.inputParams).toContain('Ordering.API')
  })

  it('maps an errored agent hit: ERROR→hasError+type, null parent, agent name/id', () => {
    const s = normalizeOpenObserveHit(raw.agent)
    expect(s.operation).toBe('invoke_agent')
    expect(s.parentId).toBeNull()
    expect(s.agentName).toBe('Reviewer')
    expect(s.agentId).toBe('c2d899bced824ea2b7493064e62864d0')
    expect(s.hasError).toBe(true)
    expect(s.errorType).toBe('System.Threading.Tasks.TaskCanceledException')
  })
})
