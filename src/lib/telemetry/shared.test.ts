import { describe, expect, it } from 'vitest'
import { classifySpanRow, identityFields, pickIdentityValue } from './shared'

describe('pickIdentityValue', () => {
  it('returns id when userId is set', () => {
    expect(pickIdentityValue({ userId: 'u1' })).toEqual({ kind: 'id', value: 'u1' })
  })
  it('prefers userId over userName when both are set', () => {
    expect(pickIdentityValue({ userId: 'u1', userName: 'alice' })).toEqual({ kind: 'id', value: 'u1' })
  })
  it('returns name when only userName is set', () => {
    expect(pickIdentityValue({ userName: 'alice' })).toEqual({ kind: 'name', value: 'alice' })
  })
  it('returns undefined when nothing is set', () => {
    expect(pickIdentityValue(undefined)).toBeUndefined()
    expect(pickIdentityValue({})).toBeUndefined()
  })
})

describe('identityFields', () => {
  it('maps the user pick to its canonical field', () => {
    expect(identityFields({ userId: 'u1' })).toEqual([{ field: 'userId', value: 'u1' }])
    expect(identityFields({ userName: 'alice' })).toEqual([{ field: 'userName', value: 'alice' }])
  })
  it('stacks host onto the user pick', () => {
    expect(identityFields({ userId: 'u1', host: 'web-1' })).toEqual([
      { field: 'userId', value: 'u1' },
      { field: 'host', value: 'web-1' },
    ])
  })
  it('returns host alone when no user is set', () => {
    expect(identityFields({ host: 'web-1' })).toEqual([{ field: 'host', value: 'web-1' }])
  })
  it('is empty when nothing is set', () => {
    expect(identityFields(undefined)).toEqual([])
    expect(identityFields({})).toEqual([])
  })
})

describe('classifySpanRow', () => {
  it('labels a sub-agent by the agent-name attribute over the model in the span name', () => {
    expect(classifySpanRow('invoke_agent gpt-5-nano', '', 'loupe agent')).toEqual({
      kind: 'sub-agent',
      label: 'loupe agent',
    })
  })
  it('falls back to parsing the span name when no attribute is present', () => {
    expect(classifySpanRow('invoke_agent Reviewer', '')).toEqual({ kind: 'sub-agent', label: 'Reviewer' })
  })
  it('a purpose tag makes it a utility row regardless of agent name', () => {
    expect(classifySpanRow('invoke_agent gpt-5-nano', 'title_generation', 'loupe agent')).toEqual({
      kind: 'utility',
      label: 'title_generation',
    })
  })
})
