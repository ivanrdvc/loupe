import { listServerTools } from './client'
import { lintMcpRegistry } from './lint'
import { getRegistrySource } from './registry'
import type { McpRegistryResult, McpServer } from './types'

const CONCURRENCY = 5

async function listMcpRegistry(): Promise<McpRegistryResult> {
  const fetchedAt = Date.now()
  const source = getRegistrySource()
  const refs = await source.listServerRefs()
  const errors: McpRegistryResult['errors'] = []

  const servers = await mapLimited(refs, CONCURRENCY, async (ref): Promise<McpServer> => {
    if (!ref.endpoint) {
      return { ...ref, tools: [], fetchStatus: 'skipped', fetchedAt }
    }

    try {
      const tools = await listServerTools(ref)
      return { ...ref, tools, fetchStatus: 'ok', fetchedAt }
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e)
      errors.push({ serverId: ref.id, serverName: ref.name, message })
      return { ...ref, tools: [], fetchStatus: 'error', fetchError: message, fetchedAt }
    }
  })

  return { servers, fetchedAt, partial: errors.length > 0, errors }
}

export async function listMcpRegistryWithLint() {
  const registry = await listMcpRegistry()
  return { ...registry, findings: lintMcpRegistry(registry.servers) }
}

async function mapLimited<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out: R[] = []
  let next = 0

  async function worker() {
    while (next < items.length) {
      const index = next
      next += 1
      out[index] = await fn(items[index])
    }
  }

  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker))
  return out
}
