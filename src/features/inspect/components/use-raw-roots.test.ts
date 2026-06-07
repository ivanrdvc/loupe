import { describe, expect, it } from 'vitest'
import { ensureRootIn, toggleRootIn } from './use-raw-roots'

describe('toggleRootIn', () => {
  it('adds an absent id', () => {
    const next = toggleRootIn(new Set(), 'a')
    expect([...next]).toEqual(['a'])
  })

  it('removes a present id', () => {
    const next = toggleRootIn(new Set(['a', 'b']), 'a')
    expect([...next].sort()).toEqual(['b'])
  })

  it('returns a new set instance (does not mutate)', () => {
    const prev = new Set(['a'])
    const next = toggleRootIn(prev, 'b')
    expect(next).not.toBe(prev)
    expect([...prev]).toEqual(['a'])
  })
})

describe('ensureRootIn', () => {
  it('returns the same instance when the id is already present', () => {
    const prev = new Set(['a'])
    const next = ensureRootIn(prev, 'a')
    expect(next).toBe(prev)
  })

  it('adds the id when absent', () => {
    const next = ensureRootIn(new Set(['a']), 'b')
    expect([...next].sort()).toEqual(['a', 'b'])
  })
})
