import { errMessage } from '#/lib/format'
import { listServerTools } from './client'
import { lintMcpRegistry } from './lint'
import { getRegistrySource } from './registry'
import type { McpRegistryResult, McpServer } from './types'

const CONCURRENCY = 5

async function listMcpRegistry(): Promise<McpRegistryResult> {
  const fetchedAt = Date.now()
  const source = getRegistrySource()
  const refs = await source.listServerRefs()

  const servers = await mapLimited(refs, CONCURRENCY, async (ref): Promise<McpServer> => {
    if (!ref.endpoint) {
      return { ...ref, tools: [], fetchStatus: 'skipped', fetchedAt }
    }

    try {
      const tools = await listServerTools(ref)
      return { ...ref, tools, fetchStatus: 'ok', fetchedAt }
    } catch (e) {
      return { ...ref, tools: [], fetchStatus: 'error', fetchError: errMessage(e), fetchedAt }
    }
  })

  return { servers, fetchedAt, partial: servers.some((s) => s.fetchStatus === 'error') }
}

export async function listMcpRegistryWithLint() {
  const registry = await listMcpRegistry()
  return { ...registry, findings: lintMcpRegistry(registry.servers) }
}

export { aggregateTools, type UniqueTool } from './logic/aggregate-tools'
export {
  findingsForServer,
  groupFindingsByCategory,
  LINT_CATEGORY_LABELS,
  worstSeverity,
} from './logic/lint-helpers'
export type { LintSeverity, McpLintFinding, McpServer, McpTool, McpToolAnnotations } from './types'

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
