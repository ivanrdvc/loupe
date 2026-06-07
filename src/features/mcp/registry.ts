import type { McpServerRef, McpTransport, RegistrySource } from './types'

type RawServerRef = {
  id?: unknown
  name?: unknown
  endpoint?: unknown
  url?: unknown
  transport?: unknown
  ownerTeam?: unknown
  owner_team?: unknown
  ownerContact?: unknown
  owner_contact?: unknown
  source?: unknown
}

export function getRegistrySource(): RegistrySource {
  return new EnvRegistrySource()
}

class EnvRegistrySource implements RegistrySource {
  name = 'env'

  async listServerRefs(): Promise<McpServerRef[]> {
    const raw = process.env.MCP_REGISTRY_REFS_JSON
    if (!raw) return []

    const parsed = JSON.parse(raw) as unknown
    if (!Array.isArray(parsed)) throw new Error('MCP_REGISTRY_REFS_JSON must be a JSON array')

    return parsed.map((item, index) => normalizeRef(item as RawServerRef, index))
  }
}

function normalizeRef(raw: RawServerRef, index: number): McpServerRef {
  const name = string(raw.name) ?? `server-${index + 1}`
  const endpoint = string(raw.endpoint) ?? string(raw.url)

  return {
    id: string(raw.id) ?? `${string(raw.source) ?? 'env'}:${name}`,
    name,
    endpoint,
    transport: transport(raw.transport),
    ownerTeam: string(raw.ownerTeam) ?? string(raw.owner_team),
    ownerContact: string(raw.ownerContact) ?? string(raw.owner_contact),
    source: string(raw.source) ?? 'env',
  }
}

function string(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined
}

function transport(value: unknown): McpTransport {
  if (value === 'streamable-http' || value === 'sse' || value === 'stdio') return value
  return 'unknown'
}
