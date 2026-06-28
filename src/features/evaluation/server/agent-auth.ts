import { AgentCallError, type AgentCallInput, type AgentCallResult, callAgent } from './agent-run'

// expiresAt is epoch ms. Refresh a hair early so a token never expires mid-flight.
const REFRESH_AHEAD_MS = 30_000
const FALLBACK_TTL_MS = 5 * 60_000

export interface MintedToken {
  token: string
  expiresAt: number
}

// Resolved handshake built from a target + identity; mintToken is the fork seam.
export interface AuthContext {
  cacheKey: string // identity+target, so the same user on two servers caches separately
  label: string
  authEndpoint?: string
  credentials?: Record<string, unknown>
  tokenPath?: string
  staticHeaders: Record<string, string>
}

function readPath(obj: unknown, path: string): unknown {
  return path.split('.').reduce<unknown>((acc, key) => {
    if (acc == null || typeof acc !== 'object') return undefined
    return (acc as Record<string, unknown>)[key]
  }, obj)
}

// Fork seam: naive default POSTs `credentials` to `authEndpoint` and reads `tokenPath`. A
// fork patches this for real IdPs in its own tree — no registry, no src/extensions.
export async function mintToken(ctx: AuthContext): Promise<MintedToken> {
  if (!ctx.authEndpoint) throw new Error(`"${ctx.label}" has no authEndpoint to mint a token from`)
  const res = await fetch(ctx.authEndpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(ctx.credentials ?? {}),
    signal: AbortSignal.timeout(30_000),
  })
  if (!res.ok) throw new Error(`Token mint failed (${res.status}) for "${ctx.label}"`)
  const json = (await res.json()) as Record<string, unknown>
  const token = readPath(json, ctx.tokenPath ?? 'access_token')
  if (typeof token !== 'string' || !token) throw new Error(`Token mint for "${ctx.label}" returned no token`)
  const expiresIn = json.expires_in
  const expiresAt =
    typeof expiresIn === 'number' && expiresIn > 0 ? Date.now() + expiresIn * 1000 : Date.now() + FALLBACK_TTL_MS
  return { token, expiresAt }
}

const cache = new Map<string, MintedToken>()
const inflight = new Map<string, Promise<MintedToken>>()

function fresh(t: MintedToken | undefined): t is MintedToken {
  return !!t && t.expiresAt - REFRESH_AHEAD_MS > Date.now()
}

// Single-flight per identity+target so concurrent server-fn calls don't stampede the auth
// endpoint, and one mint is shared across a run's examples.
async function tokenFor(ctx: AuthContext): Promise<MintedToken> {
  const cached = cache.get(ctx.cacheKey)
  if (fresh(cached)) return cached
  const pending = inflight.get(ctx.cacheKey)
  if (pending) return pending
  const p = mintToken(ctx)
    .then((minted) => {
      cache.set(ctx.cacheKey, minted)
      return minted
    })
    .finally(() => inflight.delete(ctx.cacheKey))
  inflight.set(ctx.cacheKey, p)
  return p
}

export function invalidateToken(cacheKey: string): void {
  cache.delete(cacheKey)
}

// Drop cached tokens touching an edited identity/target so a creds change can't keep authing
// with the stale token. cacheKey is `${targetId}:${identityId}`.
export function invalidateIdentity(identityId: string): void {
  for (const key of cache.keys()) if (key.endsWith(`:${identityId}`)) cache.delete(key)
}

export function invalidateTarget(targetId: string): void {
  for (const key of cache.keys()) if (key.startsWith(`${targetId}:`)) cache.delete(key)
}

// Returns headers + the bare token so callers can scrub it. No authEndpoint = headers only.
export async function authHeadersFor(ctx: AuthContext): Promise<{ headers: Record<string, string>; token?: string }> {
  const headers = { ...ctx.staticHeaders }
  if (!ctx.authEndpoint) return { headers }
  const { token } = await tokenFor(ctx)
  return { headers: { ...headers, Authorization: `Bearer ${token}` }, token }
}

export function resolveAgentEndpoint(requested: string | null, saved: string | null, fallback: string): string {
  if (saved && requested) throw new Error('A saved target cannot be combined with a custom endpoint URL')
  return saved ?? requested ?? fallback
}

export function createAuthenticatedAgentCaller(
  ctx: AuthContext,
  options: { useIdentity: boolean; adHocToken?: string | null },
): {
  call: (input: Omit<AgentCallInput, 'headers'>) => Promise<AgentCallResult>
  secrets: () => Array<string | undefined>
} {
  const staticSecrets = Object.values(ctx.staticHeaders)
  let resolvedSecrets: Array<string | undefined> = [
    ...staticSecrets,
    ...(options.adHocToken ? [options.adHocToken] : []),
  ]

  const headers = async (): Promise<Record<string, string>> => {
    if (options.useIdentity) {
      const auth = await authHeadersFor(ctx)
      resolvedSecrets = [...staticSecrets, auth.token]
      return auth.headers
    }
    if (options.adHocToken) {
      return { ...ctx.staticHeaders, Authorization: `Bearer ${options.adHocToken}` }
    }
    return ctx.staticHeaders
  }

  const call = async (input: Omit<AgentCallInput, 'headers'>): Promise<AgentCallResult> => {
    try {
      return await callAgent({ ...input, headers: await headers() })
    } catch (err) {
      if (!options.useIdentity || !(err instanceof AgentCallError) || err.status !== 401) throw err
      invalidateToken(ctx.cacheKey)
      return callAgent({ ...input, headers: await headers() })
    }
  }

  return { call, secrets: () => resolvedSecrets }
}
