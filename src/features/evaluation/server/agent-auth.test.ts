import { afterEach, describe, expect, it, vi } from 'vitest'
import { createAuthenticatedAgentCaller, resolveAgentEndpoint } from './agent-auth'

const context = (cacheKey: string) => ({
  cacheKey,
  label: 'Developer',
  authEndpoint: 'https://auth.example/token',
  credentials: { username: 'dev', password: 'secret' },
  staticHeaders: { 'X-Tenant': 'acme' },
})

const jsonResponse = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })

afterEach(() => vi.unstubAllGlobals())

describe('resolveAgentEndpoint', () => {
  it('uses the saved endpoint when a target is selected', () => {
    expect(resolveAgentEndpoint(null, 'https://saved.example/responses', 'https://fallback.example')).toBe(
      'https://saved.example/responses',
    )
  })

  it('uses a custom endpoint when no target is selected', () => {
    expect(resolveAgentEndpoint('https://custom.example/responses', null, 'https://fallback.example')).toBe(
      'https://custom.example/responses',
    )
  })

  it('rejects combining saved authentication with a custom endpoint', () => {
    expect(() =>
      resolveAgentEndpoint('https://attacker.example/responses', 'https://saved.example/responses', 'fallback'),
    ).toThrow('saved target')
  })
})

describe('createAuthenticatedAgentCaller', () => {
  it('treats only credential-bearing static headers as secrets', async () => {
    const adapter = vi.fn(async () => ({
      text: 'ok',
      durationMs: 1,
      rawJson: '{}',
      tokens: 0,
      inputTokens: null,
      outputTokens: null,
    }))
    const caller = createAuthenticatedAgentCaller(
      {
        ...context('header-secrets'),
        authEndpoint: undefined,
        staticHeaders: { 'X-Region': 'production', 'X-Api-Key': 'top-secret-value' },
      },
      { useIdentity: false, adapter },
    )

    await caller.call({ endpointUrl: 'https://agent.example/responses', input: 'ping' })

    expect(caller.secrets()).toContain('top-secret-value')
    expect(caller.secrets()).not.toContain('production')
  })

  it('caches a minted token across calls', async () => {
    const fetchMock = vi.fn(async (input: string | URL | Request) => {
      const url = String(input)
      if (url.includes('/token')) return jsonResponse({ access_token: 'cached-token', expires_in: 3600 })
      return jsonResponse({ output_text: 'ok' })
    })
    vi.stubGlobal('fetch', fetchMock)
    const caller = createAuthenticatedAgentCaller(context('cache-test'), { useIdentity: true })

    await caller.call({ endpointUrl: 'https://agent.example/responses', input: 'one' })
    await caller.call({ endpointUrl: 'https://agent.example/responses', input: 'two' })

    expect(fetchMock.mock.calls.filter(([input]) => String(input).includes('/token'))).toHaveLength(1)
  })

  it('re-mints once and retries after a 401', async () => {
    let mintCount = 0
    let agentCount = 0
    const authorizations: string[] = []
    const fetchMock = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url = String(input)
      if (url.includes('/token')) {
        mintCount += 1
        return jsonResponse({ access_token: mintCount === 1 ? 'stale-token' : 'fresh-token', expires_in: 3600 })
      }
      agentCount += 1
      authorizations.push(new Headers(init?.headers).get('Authorization') ?? '')
      return agentCount === 1 ? jsonResponse({ error: 'expired' }, 401) : jsonResponse({ output_text: 'ok' })
    })
    vi.stubGlobal('fetch', fetchMock)
    const caller = createAuthenticatedAgentCaller(context('retry-test'), { useIdentity: true })

    const result = await caller.call({ endpointUrl: 'https://agent.example/responses', input: 'ping' })

    expect(result.text).toBe('ok')
    expect(mintCount).toBe(2)
    expect(agentCount).toBe(2)
    expect(authorizations).toEqual(['Bearer stale-token', 'Bearer fresh-token'])
    expect(caller.secrets()).toContain('fresh-token')
  })

  it('does not retry a non-authentication failure', async () => {
    const fetchMock = vi.fn(async (input: string | URL | Request) => {
      const url = String(input)
      if (url.includes('/token')) return jsonResponse({ access_token: 'token', expires_in: 3600 })
      return jsonResponse({ error: 'broken' }, 500)
    })
    vi.stubGlobal('fetch', fetchMock)
    const caller = createAuthenticatedAgentCaller(context('failure-test'), { useIdentity: true })

    await expect(caller.call({ endpointUrl: 'https://agent.example/responses', input: 'ping' })).rejects.toThrow(
      'Run failed (500)',
    )
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })
})
