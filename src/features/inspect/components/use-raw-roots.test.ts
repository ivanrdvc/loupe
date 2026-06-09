import { describe, expect, it } from 'vitest'
import { effectiveRawRoots, toggleRootIn } from './use-raw-roots'

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

describe('effectiveRawRoots', () => {
  const ids = ['a', 'b', 'c']

  it('is empty under default-off with no overrides', () => {
    expect([...effectiveRawRoots(ids, false, new Set())]).toEqual([])
  })

  it('is every root under default-on with no overrides', () => {
    expect([...effectiveRawRoots(ids, true, new Set())].sort()).toEqual(['a', 'b', 'c'])
  })

  it('default-off plus a pick turns just that root raw', () => {
    expect([...effectiveRawRoots(ids, false, new Set(['b']))]).toEqual(['b'])
  })

  it('default-on minus an exception keeps the toggle-off stuck (the bug)', () => {
    expect([...effectiveRawRoots(ids, true, new Set(['a'])).values()].sort()).toEqual(['b', 'c'])
  })

  it('auto-includes a newly-arrived trace while default-on', () => {
    expect([...effectiveRawRoots([...ids, 'd'], true, new Set())].sort()).toEqual(['a', 'b', 'c', 'd'])
  })

  it('ignores overrides for ids no longer present', () => {
    expect([...effectiveRawRoots(ids, false, new Set(['gone']))]).toEqual([])
  })
})
