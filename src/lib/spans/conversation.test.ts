import { describe, expect, it } from 'vitest'
import { asMessages } from './conversation'

describe('asMessages — content format support', () => {
  it('parses Logfire { role, parts: [...] } format', () => {
    const out = asMessages([
      { role: 'user', parts: [{ type: 'text', content: 'hi' }] },
      { role: 'assistant', parts: [{ type: 'text', content: 'hello' }] },
    ])
    expect(out).toEqual([
      { role: 'user', parts: [{ kind: 'text', content: 'hi' }] },
      { role: 'assistant', parts: [{ kind: 'text', content: 'hello' }] },
    ])
  })

  it('parses OpenAI plain-string content: { role, content: "..." }', () => {
    const out = asMessages([{ role: 'user', content: 'hello world' }])
    expect(out).toEqual([{ role: 'user', parts: [{ kind: 'text', content: 'hello world' }] }])
  })

  it('parses OpenAI structured content: { role, content: [{ type:"text", text:"..." }] }', () => {
    const out = asMessages([
      {
        role: 'user',
        content: [
          { type: 'text', text: 'first' },
          { type: 'text', text: 'second' },
        ],
      },
    ])
    expect(out).toEqual([
      {
        role: 'user',
        parts: [
          { kind: 'text', content: 'first' },
          { kind: 'text', content: 'second' },
        ],
      },
    ])
  })

  it('prefers parts over content when both are present (Logfire wins)', () => {
    const out = asMessages([
      {
        role: 'user',
        parts: [{ type: 'text', content: 'from parts' }],
        content: 'from content',
      },
    ])
    expect(out[0].parts).toEqual([{ kind: 'text', content: 'from parts' }])
  })

  it('drops messages where neither parts nor content yields anything', () => {
    expect(asMessages([{ role: 'user' }])).toEqual([])
    expect(asMessages([{ role: 'user', content: '' }])).toEqual([])
    expect(asMessages([{ role: 'user', content: [{ type: 'image' }] }])).toEqual([])
  })

  it('skips unknown roles (tool, function, etc.)', () => {
    const out = asMessages([
      { role: 'tool', content: 'tool result text' },
      { role: 'user', content: 'real' },
    ])
    expect(out).toEqual([{ role: 'user', parts: [{ kind: 'text', content: 'real' }] }])
  })
})
