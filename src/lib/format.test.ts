import { describe, expect, it } from 'vitest'
import { errMessage, tokensFromChars } from './format'

describe('errMessage', () => {
  it('returns the message of an Error', () => {
    expect(errMessage(new Error('boom'))).toBe('boom')
    expect(errMessage(new TypeError('bad type'))).toBe('bad type')
  })

  it('stringifies non-Error values', () => {
    expect(errMessage('plain string')).toBe('plain string')
    expect(errMessage(42)).toBe('42')
    expect(errMessage(null)).toBe('null')
    expect(errMessage(undefined)).toBe('undefined')
    expect(errMessage({ code: 1 })).toBe('[object Object]')
  })
})

describe('tokensFromChars', () => {
  it('estimates ~4 chars per token, rounding up', () => {
    expect(tokensFromChars(0)).toBe(0)
    expect(tokensFromChars(1)).toBe(1)
    expect(tokensFromChars(4)).toBe(1)
    expect(tokensFromChars(5)).toBe(2)
    expect(tokensFromChars(400)).toBe(100)
  })
})
