import { describe, expect, it } from 'vitest'
import { tokensFromChars } from '#/lib/format'
import { countTokens } from './tokens'

describe('countTokens', () => {
  it('returns 0 for empty text', () => {
    expect(countTokens('')).toBe(0)
  })

  it('returns a positive integer for non-empty text', () => {
    const n = countTokens('hello world')
    expect(n).toBeGreaterThan(0)
    expect(Number.isInteger(n)).toBe(true)
  })

  it('counts more tokens than the chars/4 estimate for structured JSON', () => {
    const s = '["3-0","3-1","3-2","3-3","3-4"]'
    expect(countTokens(s)).toBeGreaterThan(tokensFromChars(s.length))
  })
})

describe('tokensFromChars', () => {
  it('rounds up (Math.ceil of chars/4)', () => {
    expect(tokensFromChars(0)).toBe(0)
    expect(tokensFromChars(4)).toBe(1)
    expect(tokensFromChars(5)).toBe(2)
  })
})
