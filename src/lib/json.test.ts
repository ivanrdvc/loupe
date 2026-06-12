import { describe, expect, it } from 'vitest'
import { parseJsonConcat } from './json'

describe('parseJsonConcat', () => {
  it('parses newline-delimited JSON objects', () => {
    expect(parseJsonConcat('{"a":1}\n{"b":2}\n{"c":3}')).toEqual([{ a: 1 }, { b: 2 }, { c: 3 }])
  })

  it('parses pretty-printed concatenated objects', () => {
    expect(parseJsonConcat('{\n  "title": "Doc #0",\n  "score": 0.672\n}\n{\n  "title": "Doc #1"\n}')).toEqual([
      { title: 'Doc #0', score: 0.672 },
      { title: 'Doc #1' },
    ])
  })

  it('ignores braces inside strings', () => {
    expect(parseJsonConcat('{"a":"}{"}\n{"b":"\\"}"}')).toEqual([{ a: '}{' }, { b: '"}' }])
  })

  it('rejects a single JSON document', () => {
    expect(parseJsonConcat('{"a":1}')).toBeUndefined()
  })

  it('rejects prose between values', () => {
    expect(parseJsonConcat('{"a":1} and then {"b":2}')).toBeUndefined()
    expect(parseJsonConcat('plain text')).toBeUndefined()
  })

  it('rejects unbalanced input', () => {
    expect(parseJsonConcat('{"a":1}\n{"b":')).toBeUndefined()
  })
})
