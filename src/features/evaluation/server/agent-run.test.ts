import { afterEach, describe, expect, it, vi } from 'vitest'
import { AgentCallError, callAgent, callVercelAiStream, resolveAdapter } from './agent-run'

function sseStream(lines: string[]): ReadableStream<Uint8Array> {
  const enc = new TextEncoder()
  return new ReadableStream({
    start(c) {
      for (const l of lines) c.enqueue(enc.encode(`${l}\n`))
      c.close()
    },
  })
}

function rawStream(value: string): ReadableStream<Uint8Array> {
  return new ReadableStream({
    start(controller) {
      controller.enqueue(new TextEncoder().encode(value))
      controller.close()
    },
  })
}

afterEach(() => vi.unstubAllGlobals())

describe('resolveAdapter', () => {
  it('maps a key to its adapter and falls back to openai-responses', () => {
    expect(resolveAdapter('openai-responses')).toBe(callAgent)
    expect(resolveAdapter('vercel-ai-stream')).toBe(callVercelAiStream)
    expect(resolveAdapter(undefined)).toBe(callAgent)
    expect(resolveAdapter('nope')).toBe(callAgent)
  })
})

describe('callVercelAiStream', () => {
  it('accumulates text-delta parts and maps input → a user message + sessionId', async () => {
    let sent: { messages: { parts: { text: string }[] }[]; sessionId?: string } | undefined
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_url: string, init: { body: string }) => {
        sent = JSON.parse(init.body)
        return new Response(
          sseStream([
            'data: {"type":"text-delta","id":"1","delta":"Hello "}',
            'data: {"type":"text-delta","id":"1","delta":"world"}',
            'data: [DONE]',
          ]),
          { status: 200 },
        )
      }),
    )

    const res = await callVercelAiStream({
      endpointUrl: 'http://localhost/api/chat',
      input: 'what happened?',
      conversationId: 'conv-1',
    })

    expect(res.text).toBe('Hello world')
    expect(res.tokens).toBe(0)
    expect(sent?.messages[0].parts[0].text).toBe('what happened?')
    expect(sent?.sessionId).toBe('conv-1')
  })

  it('throws on an error part in the stream', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () => new Response(sseStream(['data: {"type":"error","errorText":"tool blew up"}']), { status: 200 }),
      ),
    )
    await expect(callVercelAiStream({ endpointUrl: 'http://localhost/api/chat', input: 'x' })).rejects.toThrow(
      /tool blew up/,
    )
  })

  it('processes a final event without a trailing newline', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(rawStream('data: {"type":"error","errorText":"final failure"}'), { status: 200 })),
    )
    await expect(callVercelAiStream({ endpointUrl: 'http://localhost/api/chat', input: 'x' })).rejects.toThrow(
      /final failure/,
    )
  })

  it('throws AgentCallError carrying the HTTP status on a non-ok response', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('nope', { status: 502 })),
    )
    await expect(callVercelAiStream({ endpointUrl: 'http://localhost/api/chat', input: 'x' })).rejects.toMatchObject({
      status: 502,
    })
    expect(AgentCallError).toBeDefined()
  })
})

describe('callAgent', () => {
  it('falls through an empty output_text to structured output', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          new Response(
            JSON.stringify({
              output_text: '',
              output: [{ type: 'message', content: [{ type: 'output_text', text: 'real answer' }] }],
            }),
            { status: 200, headers: { 'Content-Type': 'application/json' } },
          ),
      ),
    )

    const result = await callAgent({ endpointUrl: 'http://localhost/responses', input: 'x' })

    expect(result.text).toBe('real answer')
  })
})
