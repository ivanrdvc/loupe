import { describe, expect, it } from 'vitest'
import { deriveMeta, exampleEntrySchema, type ResolvedExample } from './shared'

const resolved = (sourceAgent: string | null): ResolvedExample => ({
  cap: { input: 'q', defaultExpected: 'a', sourceTraceId: 't', sourceSpanId: 's', sourceAgent },
  expected: 'a',
})

describe('deriveMeta', () => {
  it('derives name, tags, and description from the captured agent', () => {
    const meta = deriveMeta([resolved('loupe agent')], {})
    expect(meta.name).toBe('loupe agent regression')
    expect(meta.tags).toEqual(['loupe agent', 'regression'])
    expect(meta.description).toContain('1 run of loupe agent')
  })

  it('falls back to a generic name and pluralizes when no agent is known', () => {
    const meta = deriveMeta([resolved(null), resolved(null)], {})
    expect(meta.name).toBe('regression dataset')
    expect(meta.tags).toEqual(['regression'])
    expect(meta.description).toContain('2 runs.')
  })

  it('uses the first observed agent across mixed captures', () => {
    expect(deriveMeta([resolved('first'), resolved('second')], {}).name).toBe('first regression')
  })

  it('lets caller-supplied values win over the derived defaults', () => {
    const given = { name: 'My set', tags: ['custom'], description: 'Hand written.' }
    expect(deriveMeta([resolved('loupe agent')], given)).toEqual(given)
  })
})

describe('exampleEntrySchema', () => {
  it('requires exactly one source', () => {
    expect(exampleEntrySchema.safeParse({}).success).toBe(false)
    expect(exampleEntrySchema.safeParse({ traceId: 't', sessionId: 's' }).success).toBe(false)
    expect(exampleEntrySchema.safeParse({ traceId: 't' }).success).toBe(true)
    expect(exampleEntrySchema.safeParse({ sessionId: 's' }).success).toBe(true)
  })

  it('rejects trace-specific fields on sessions', () => {
    expect(exampleEntrySchema.safeParse({ sessionId: 's', spanId: 'p' }).success).toBe(false)
    expect(exampleEntrySchema.safeParse({ sessionId: 's', expected: 'answer' }).success).toBe(false)
  })
})
