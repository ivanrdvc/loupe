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

export interface McpToolAnnotations {
  readOnlyHint?: boolean
  destructiveHint?: boolean
  idempotentHint?: boolean
  openWorldHint?: boolean
}

export interface McpTool {
  id: string
  serverId: string
  serverName: string
  name: string
  title?: string
  description?: string
  inputSchema?: JsonValue
  annotations?: McpToolAnnotations
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

export type LintSeverity = 'info' | 'warning' | 'error'

export type LintCategory = 'server-health' | 'tool-catalog' | 'naming'

export interface McpLintFinding {
  severity: LintSeverity
  category: LintCategory
  ruleId: string
  message: string
  serverId: string
  serverName: string
  toolId?: string
  toolName?: string
  evidence?: JsonValue
}
