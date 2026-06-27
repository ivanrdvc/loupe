import { errMessage } from '#/lib/format'
import { listServerTools } from './client'
import { lintMcpRegistry } from './lint'
import { LINT_CONFIG } from './lint-config'
import { deriveSignals, TOOL_SIGNALS, type ToolSignal } from './logic/signals'
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
  return { ...registry, findings: lintMcpRegistry(registry.servers, { config: LINT_CONFIG }) }
}

// For name-keyed surfaces (e.g. /tools) that lack the input schema deriveSignals needs.
export async function listToolSignals(): Promise<Record<string, ToolSignal[]>> {
  const { servers } = await listMcpRegistry()
  const byName: Record<string, ToolSignal[]> = {}
  for (const server of servers)
    for (const tool of server.tools) {
      const merged = new Set([...(byName[tool.name] ?? []), ...deriveSignals(tool)])
      byName[tool.name] = TOOL_SIGNALS.filter((s) => merged.has(s))
    }
  return byName
}

export { SignalBadges } from './components/signal-badges'
export { BUILTIN_RULES, lintMcpRegistry } from './lint'
export { aggregateTools, type UniqueTool } from './logic/aggregate-tools'
export {
  findingsForServer,
  groupFindingsByCategory,
  LINT_CATEGORY_LABELS,
  worstSeverity,
} from './logic/lint-helpers'
export {
  deriveSignals,
  mergeSignalsByName,
  TOOL_SIGNAL_DESCRIPTIONS,
  TOOL_SIGNALS,
  type ToolSignal,
} from './logic/signals'
export { TOOL_TAGS } from './tool-tags'
export type {
  LintRule,
  LintSeverity,
  McpLintConfig,
  McpLintFinding,
  McpServer,
  McpTool,
  McpToolAnnotations,
  RuleConfig,
} from './types'

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
