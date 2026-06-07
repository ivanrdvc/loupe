import type { McpLintFinding, McpServer, McpTool } from './types'

const TOOL_COUNT_WARN = 30
const TOOL_COUNT_ERROR = 50
const DESCRIPTION_MIN = 20
const DESCRIPTION_MAX = 500

export function lintMcpRegistry(servers: McpServer[]): McpLintFinding[] {
  return servers.flatMap((server) => [...lintServer(server), ...server.tools.flatMap((tool) => lintTool(server, tool))])
}

function lintServer(server: McpServer): McpLintFinding[] {
  const findings: McpLintFinding[] = []

  if (!server.ownerTeam && !server.ownerContact) {
    findings.push({
      severity: 'warning',
      ruleId: 'server.owner.missing',
      message: 'Server has no owner.',
      serverId: server.id,
      serverName: server.name,
    })
  }

  const count = server.tools.length
  if (count > TOOL_COUNT_WARN) {
    findings.push({
      severity: count > TOOL_COUNT_ERROR ? 'error' : 'warning',
      ruleId: 'server.tool_count',
      message: `Server exposes ${count} tools.`,
      serverId: server.id,
      serverName: server.name,
      evidence: { count, warning: TOOL_COUNT_WARN, error: TOOL_COUNT_ERROR },
    })
  }

  if (server.fetchStatus === 'error') {
    findings.push({
      severity: 'error',
      ruleId: 'server.fetch_failed',
      message: server.fetchError ?? 'Could not fetch live server tools.',
      serverId: server.id,
      serverName: server.name,
    })
  }

  return findings
}

function lintTool(server: McpServer, tool: McpTool): McpLintFinding[] {
  const findings: McpLintFinding[] = []

  if (tool.name.length < 3 || tool.name.length > 40 || /\s/.test(tool.name)) {
    findings.push({
      severity: 'warning',
      ruleId: 'tool.name.shape',
      message: 'Tool name should be 3-40 characters with no whitespace.',
      serverId: server.id,
      serverName: server.name,
      toolId: tool.id,
      toolName: tool.name,
    })
  }

  const description = tool.description?.trim() ?? ''
  if (description.length < DESCRIPTION_MIN || description.length > DESCRIPTION_MAX) {
    findings.push({
      severity: description.length === 0 ? 'error' : 'warning',
      ruleId: 'tool.description',
      message:
        description.length === 0
          ? 'Tool has no description.'
          : 'Tool description length is outside the expected range.',
      serverId: server.id,
      serverName: server.name,
      toolId: tool.id,
      toolName: tool.name,
      evidence: { length: description.length, minimum: DESCRIPTION_MIN, maximum: DESCRIPTION_MAX },
    })
  }

  if (isEmptySchema(tool.inputSchema)) {
    findings.push({
      severity: 'warning',
      ruleId: 'tool.schema.empty',
      message: 'Tool input schema is empty.',
      serverId: server.id,
      serverName: server.name,
      toolId: tool.id,
      toolName: tool.name,
    })
  }

  return findings
}

function isEmptySchema(schema: unknown): boolean {
  if (!schema || typeof schema !== 'object') return true
  return Object.keys(schema).length === 0
}
