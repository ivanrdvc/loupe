import { describe, expect, it } from 'vitest'
import { buildVerdictSchema, parseVerdict } from './judge'

describe('parseVerdict', () => {
  it('parses a clean JSON object', () => {
    expect(parseVerdict('{"value": 1, "explanation": "ok"}', 'numeric')).toEqual({
      value: 1,
      label: null,
      explanation: 'ok',
    })
  })

  it('extracts the JSON object when prose contains stray braces before it', () => {
    const text = 'Here is {context}. Final verdict: {"value": 4, "explanation": "good"}'
    expect(parseVerdict(text, 'numeric')).toEqual({ value: 4, label: null, explanation: 'good' })
  })

  it('extracts JSON from a fenced code block', () => {
    const text = 'Sure:\n```json\n{"label": "correct", "reason": "matches"}\n```'
    expect(parseVerdict(text, 'categorical')).toEqual({ value: null, label: 'correct', explanation: 'matches' })
  })

  it('handles nested objects without truncating', () => {
    const text = '{"value": 0.5, "explanation": "x", "meta": {"a": 1}}'
    expect(parseVerdict(text, 'numeric')).toMatchObject({ value: 0.5, explanation: 'x' })
  })

  it('does not break on a brace inside a string literal', () => {
    const text = '{"label": "uses {curly} braces", "value": 1}'
    expect(parseVerdict(text, 'boolean')).toMatchObject({ value: 1, label: 'uses {curly} braces' })
  })

  it('coerces a boolean value field to 0/1', () => {
    expect(parseVerdict('{"value": true}', 'boolean')).toMatchObject({ value: 1 })
    expect(parseVerdict('{"value": false}', 'boolean')).toMatchObject({ value: 0 })
  })

  it('falls back to a bare number when there is no JSON object', () => {
    expect(parseVerdict('I rate this a 3 out of 5', 'numeric')).toMatchObject({ value: 3 })
  })

  it('falls back to prose as the label for categorical with no JSON', () => {
    expect(parseVerdict('correct', 'categorical')).toEqual({ value: null, label: 'correct', explanation: null })
  })

  it('parses a clean schema-conformant object (structured-output happy path)', () => {
    expect(parseVerdict('{"label":"correct","explanation":"matches"}', 'categorical')).toEqual({
      value: null,
      label: 'correct',
      explanation: 'matches',
    })
  })
})

describe('buildVerdictSchema', () => {
  const props = (s: Record<string, unknown>) => s.properties as Record<string, unknown>

  it('boolean → numeric value + explanation', () => {
    const s = buildVerdictSchema('boolean')
    expect(s.type).toBe('object')
    expect(props(s)).toEqual({ value: { type: 'number' }, explanation: { type: 'string' } })
    expect(s.required).toEqual(['value', 'explanation'])
  })

  it('numeric → sets minimum/maximum from the dimension range', () => {
    const s = buildVerdictSchema('numeric', { minValue: 1, maxValue: 5 })
    expect(props(s).value).toEqual({ type: 'number', minimum: 1, maximum: 5 })
  })

  it('numeric → omits min/max when the range is unknown', () => {
    expect(props(buildVerdictSchema('numeric')).value).toEqual({ type: 'number' })
  })

  it('categorical → label is an enum of the categories', () => {
    const s = buildVerdictSchema('categorical', { categories: ['correct', 'incorrect', 'partial'] })
    expect(props(s).label).toEqual({ type: 'string', enum: ['correct', 'incorrect', 'partial'] })
    expect(s.required).toEqual(['label', 'explanation'])
  })

  it('text → free-string label, no enum', () => {
    expect(props(buildVerdictSchema('text')).label).toEqual({ type: 'string' })
  })

  it('always strict: additionalProperties false and every property required', () => {
    for (const dt of ['boolean', 'numeric', 'categorical', 'text']) {
      const s = buildVerdictSchema(dt, { categories: ['a'] })
      expect(s.additionalProperties).toBe(false)
      expect(s.required).toEqual(Object.keys(props(s)))
    }
  })
})
