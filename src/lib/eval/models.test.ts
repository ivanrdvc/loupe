import { describe, expect, it } from 'vitest'
import { JUDGE_MODELS, judgeModelProvider } from './models'

describe('judgeModelProvider', () => {
  it('routes claude* registry ids to anthropic', () => {
    expect(judgeModelProvider('claude-sonnet-4-6')).toBe('anthropic')
  })

  it('routes plain openai registry ids to openai', () => {
    expect(judgeModelProvider('gpt-4o-mini')).toBe('openai')
  })

  it('routes azure/* ids to azure', () => {
    expect(judgeModelProvider('azure/gpt-4o-mini')).toBe('azure')
    expect(judgeModelProvider('AZURE/gpt-4o-mini')).toBe('azure')
  })

  it('falls back to openai for unknown ids', () => {
    expect(judgeModelProvider('some-unlisted-model')).toBe('openai')
  })
})

describe('JUDGE_MODELS registry', () => {
  it('has unique ids', () => {
    const ids = JUDGE_MODELS.map((m) => m.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('declares a provider consistent with id-based routing', () => {
    for (const m of JUDGE_MODELS) {
      if (m.provider === 'azure') expect(m.id.startsWith('azure/')).toBe(true)
      else expect(m.id.startsWith('azure/')).toBe(false)
    }
  })

  it('exposes the azure variants of the supported openai models', () => {
    const azure = JUDGE_MODELS.filter((m) => m.provider === 'azure').map((m) => m.id.replace(/^azure\//, ''))
    const openai = JUDGE_MODELS.filter((m) => m.provider === 'openai').map((m) => m.id)
    expect(azure).toEqual(openai)
  })
})
