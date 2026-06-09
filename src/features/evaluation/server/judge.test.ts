import { APICallError, NoObjectGeneratedError } from 'ai'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { buildVerdictSchema, parseVerdict, runJudge, runJudgeSamples } from './judge'

const sdk = vi.hoisted(() => ({ generateObject: vi.fn(), generateText: vi.fn() }))
vi.mock('ai', async (importOriginal) => ({
  ...(await importOriginal<typeof import('ai')>()),
  generateObject: sdk.generateObject,
  generateText: sdk.generateText,
}))

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

const usage = { inputTokens: 100, outputTokens: 20 }
const objResult = (object: Record<string, unknown>) => ({ object, usage })

describe('runJudge (SDK seam mocked)', () => {
  const prev = {
    key: process.env.OPENAI_API_KEY,
    anthropic: process.env.ANTHROPIC_API_KEY,
    provider: process.env.JUDGE_PROVIDER,
  }
  beforeEach(() => {
    vi.clearAllMocks()
    process.env.OPENAI_API_KEY = 'test-key'
    delete process.env.ANTHROPIC_API_KEY
    delete process.env.JUDGE_PROVIDER // else the fixtures short-circuit hides the SDK path
  })
  afterEach(() => {
    process.env.OPENAI_API_KEY = prev.key
    process.env.ANTHROPIC_API_KEY = prev.anthropic
    process.env.JUDGE_PROVIDER = prev.provider
  })

  const call = (over: Partial<Parameters<typeof runJudge>[0]> = {}) =>
    runJudge({ model: 'gpt-4o-mini', judgePrompt: null, dataType: 'numeric', fields: { output: 'x' }, ...over })

  it('structured happy path returns the parsed verdict, tokens, and no error', async () => {
    sdk.generateObject.mockResolvedValue(objResult({ value: 4, explanation: 'good' }))
    const v = await call({ dataType: 'numeric' })
    expect(v).toMatchObject({ value: 4, explanation: 'good', errorType: null, inputTokens: 100, outputTokens: 20 })
    expect(typeof v.costUsd).toBe('number')
  })

  it('flags a no-signal response as parse_error rather than a pass', async () => {
    sdk.generateObject.mockResolvedValue(objResult({ explanation: 'no verdict' }))
    const v = await call({ dataType: 'boolean' })
    expect(v).toMatchObject({ value: null, errorType: 'parse_error' })
  })

  it('maps an APICallError to http_<status>', async () => {
    sdk.generateObject.mockRejectedValue(
      new APICallError({ message: 'rate limited', url: 'https://api', requestBodyValues: {}, statusCode: 429 }),
    )
    expect(await call()).toMatchObject({ errorType: 'http_429', value: null })
  })

  it('maps an aborted/timed-out call to timeout', async () => {
    sdk.generateObject.mockRejectedValue(Object.assign(new Error('aborted'), { name: 'TimeoutError' }))
    expect(await call()).toMatchObject({ errorType: 'timeout' })
  })

  it('salvages a verdict from NoObjectGeneratedError prose', async () => {
    sdk.generateObject.mockRejectedValue(
      new NoObjectGeneratedError({
        message: 'schema miss',
        text: '{"value": 1, "explanation": "ok"}',
        cause: undefined,
        response: undefined,
        usage: undefined,
        finishReason: undefined,
      } as unknown as ConstructorParameters<typeof NoObjectGeneratedError>[0]),
    )
    expect(await call({ dataType: 'boolean' })).toMatchObject({ value: 1, explanation: 'ok', errorType: null })
  })

  it('returns config_error without calling the model when the key is missing', async () => {
    delete process.env.OPENAI_API_KEY
    expect(await call()).toMatchObject({ errorType: 'config_error', value: null })
    expect(sdk.generateObject).not.toHaveBeenCalled()
  })

  it('prices an azure/* judge by its base model id (prefix stripped)', async () => {
    delete process.env.OPENAI_API_KEY
    process.env.AZURE_OPENAI_API_KEY = 'test-key'
    process.env.AZURE_OPENAI_RESOURCE_NAME = 'test-resource'
    sdk.generateObject.mockResolvedValue(objResult({ value: 4, explanation: 'good' }))
    const v = await call({ model: 'azure/gpt-4o-mini' })
    expect(v).toMatchObject({ value: 4, errorType: null })
    expect(v.costUsd).toBeGreaterThan(0)
    delete process.env.AZURE_OPENAI_API_KEY
    delete process.env.AZURE_OPENAI_RESOURCE_NAME
  })
})

describe('runJudgeSamples aggregation', () => {
  const prev = { key: process.env.OPENAI_API_KEY, provider: process.env.JUDGE_PROVIDER }
  beforeEach(() => {
    vi.clearAllMocks()
    process.env.OPENAI_API_KEY = 'test-key'
    delete process.env.JUDGE_PROVIDER
  })
  afterEach(() => {
    process.env.OPENAI_API_KEY = prev.key
    process.env.JUDGE_PROVIDER = prev.provider
  })

  const base = { model: 'gpt-4o-mini', judgePrompt: null, fields: { output: 'x' } }

  it('numeric n=3 → mean value, population variance, summed cost, per-sample trail', async () => {
    sdk.generateObject
      .mockResolvedValueOnce(objResult({ value: 2, explanation: 'a' }))
      .mockResolvedValueOnce(objResult({ value: 4, explanation: 'b' }))
      .mockResolvedValueOnce(objResult({ value: 6, explanation: 'c' }))
    const v = await runJudgeSamples({ ...base, dataType: 'numeric' }, 3)
    expect(v.samples).toBe(3)
    expect(v.value).toBe(4)
    expect(v.variance).toBeCloseTo(8 / 3) // populationVariance([2,4,6])
    expect(v.perSample.map((s) => s.value)).toEqual([2, 4, 6])
    expect(v.inputTokens).toBe(300)
    expect(v.errorType).toBeNull()
  })

  it('categorical n=3 → modal label wins', async () => {
    sdk.generateObject
      .mockResolvedValueOnce(objResult({ label: 'correct', explanation: 'a' }))
      .mockResolvedValueOnce(objResult({ label: 'correct', explanation: 'b' }))
      .mockResolvedValueOnce(objResult({ label: 'wrong', explanation: 'c' }))
    const v = await runJudgeSamples({ ...base, dataType: 'categorical', categories: ['correct', 'wrong'] }, 3)
    expect(v.label).toBe('correct')
    expect(v.samples).toBe(3)
  })

  it('all samples failing surfaces the error and yields no value', async () => {
    sdk.generateObject.mockRejectedValue(Object.assign(new Error('x'), { name: 'TimeoutError' }))
    const v = await runJudgeSamples({ ...base, dataType: 'numeric' }, 2)
    expect(v).toMatchObject({ value: null, errorType: 'timeout', variance: null })
  })
})
