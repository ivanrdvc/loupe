import type { McpServer, McpTool } from '../types'

interface UniqueToolProvider {
  serverId: string
  serverName: string
  tool: McpTool
}

export interface UniqueTool {
  name: string
  title?: string
  providers: UniqueToolProvider[]
  duplicate: boolean
  // A duplicate whose providers disagree on description or input schema — an
  // agent given both can't tell which behaviour it gets.
  conflict: boolean
}

export function aggregateTools(servers: McpServer[]): UniqueTool[] {
  const byName = new Map<string, McpTool[]>()
  for (const server of servers) {
    for (const tool of server.tools) {
      const list = byName.get(tool.name) ?? []
      list.push(tool)
      byName.set(tool.name, list)
    }
  }

  const out: UniqueTool[] = []
  for (const [name, tools] of byName) {
    const duplicate = tools.length > 1
    out.push({
      name,
      title: tools.find((t) => t.title)?.title,
      providers: tools.map((t) => ({ serverId: t.serverId, serverName: t.serverName, tool: t })),
      duplicate,
      conflict: duplicate && !allEquivalent(tools),
    })
  }
  return out.sort((a, b) => a.name.localeCompare(b.name))
}

function allEquivalent(tools: McpTool[]): boolean {
  const first = signature(tools[0])
  return tools.every((t) => signature(t) === first)
}

function signature(tool: McpTool): string {
  return `${(tool.description ?? '').trim()} ${JSON.stringify(tool.inputSchema ?? null)}`
}
