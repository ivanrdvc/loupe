import type { JsonValue } from '#/lib/json'

export type McpTransport = 'streamable-http' | 'sse' | 'stdio' | 'unknown'

export interface McpServerRef {
  id: string
  name: string
  endpoint?: string
  transport: McpTransport
  ownerTeam?: string
  ownerContact?: string
  source: string
}

export interface McpTool {
  id: string
  serverId: string
  serverName: string
  name: string
  description?: string
  inputSchema?: JsonValue
}

export interface McpServer extends McpServerRef {
  tools: McpTool[]
  fetchStatus: 'ok' | 'error' | 'skipped'
  fetchError?: string
  fetchedAt: number
}

export interface McpRegistryResult {
  servers: McpServer[]
  fetchedAt: number
  partial: boolean
}

export interface RegistrySource {
  name: string
  listServerRefs(): Promise<McpServerRef[]>
}

type LintSeverity = 'info' | 'warning' | 'error'

export interface McpLintFinding {
  severity: LintSeverity
  ruleId: string
  message: string
  serverId: string
  serverName: string
  toolId?: string
  toolName?: string
  evidence?: JsonValue
}
