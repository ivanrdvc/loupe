import { Link } from '@tanstack/react-router'
import { ArrowUpRight, ChevronDown, ChevronRight, Search } from 'lucide-react'
import { useMemo, useState } from 'react'
import { JsonBlock } from '#/components/ai-elements/json-block'
import { Badge } from '#/components/ui/badge'
import { Input } from '#/components/ui/input'
import {
  aggregateTools,
  facetOptions,
  type McpServer,
  type McpTool,
  TOOL_TAGS,
  type ToolFacet,
  ToolFacetBadges,
  toolFacets,
} from '#/features/mcp'
import { cn } from '#/lib/utils'

export function ToolsBrowser({ servers }: { servers: McpServer[] }) {
  const [query, setQuery] = useState('')
  const [facets, setFacets] = useState<Set<string>>(new Set())
  const [selectedId, setSelectedId] = useState<string | null>(null)

  const flags = useMemo(() => {
    const m = new Map<string, { duplicate: boolean; conflict: boolean }>()
    for (const u of aggregateTools(servers)) m.set(u.name, { duplicate: u.duplicate, conflict: u.conflict })
    return m
  }, [servers])

  const facetsFor = useMemo(() => {
    const m = new Map<string, ToolFacet[]>()
    for (const server of servers)
      for (const tool of server.tools) m.set(tool.id, toolFacets(tool, TOOL_TAGS[tool.id] ?? []))
    return m
  }, [servers])

  // Available filter chips: every facet present across the registry.
  const chips = useMemo(() => facetOptions(facetsFor.values()), [facetsFor])

  const groups = useMemo(() => {
    const q = query.trim().toLowerCase()
    const wanted = [...facets]
    return servers
      .map((server) => ({
        server,
        tools: server.tools.filter((t) => {
          if (q && !t.name.toLowerCase().includes(q) && !t.title?.toLowerCase().includes(q)) return false
          const ids = facetsFor.get(t.id)?.map((f) => f.id) ?? []
          return wanted.every((w) => ids.includes(w))
        }),
      }))
      .filter((g) => g.tools.length > 0)
  }, [servers, query, facets, facetsFor])

  const visible = useMemo(() => groups.flatMap((g) => g.tools), [groups])
  const selected = visible.find((t) => t.id === selectedId) ?? visible[0] ?? null

  const searching = query.trim() !== '' || facets.size > 0
  const collapseByDefault = groups.length > 8
  const [flipped, setFlipped] = useState<Set<string>>(new Set())
  const isOpen = (id: string) => searching || (flipped.has(id) ? collapseByDefault : !collapseByDefault)
  const toggle = (id: string) =>
    setFlipped((prev) => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  const toggleFacet = (f: string) =>
    setFacets((prev) => {
      const next = new Set(prev)
      next.has(f) ? next.delete(f) : next.add(f)
      return next
    })

  return (
    <div className="flex min-h-0 flex-1">
      <div className="flex w-72 shrink-0 flex-col border-r lg:w-80">
        <div className="relative p-3 pb-2">
          <Search
            className="pointer-events-none absolute top-[1.15rem] left-5 size-3.5 text-muted-foreground"
            aria-hidden
          />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Filter tools…"
            className="h-8 border-border bg-transparent pl-7 dark:bg-input/30"
          />
        </div>
        {chips.length > 0 && (
          <div className="flex flex-wrap gap-1 px-3 pb-2">
            {chips.map((f) => (
              <button key={f.value} type="button" onClick={() => toggleFacet(f.value)}>
                <Badge variant={facets.has(f.value) ? 'default' : 'outline'} className="cursor-pointer font-normal">
                  {f.label}
                </Badge>
              </button>
            ))}
          </div>
        )}
        <div className="min-h-0 flex-1 overflow-y-auto border-t">
          {groups.length === 0 ? (
            <p className="px-4 py-3 text-sm text-muted-foreground">No tools.</p>
          ) : (
            groups.map((g) => (
              <div key={g.server.id}>
                <div className="sticky top-0 z-10 flex items-center border-b bg-muted/60 text-xs font-medium text-muted-foreground backdrop-blur">
                  <button
                    type="button"
                    onClick={() => toggle(g.server.id)}
                    className="flex min-w-0 flex-1 items-center gap-1.5 py-1.5 pl-3 hover:text-foreground"
                  >
                    {isOpen(g.server.id) ? (
                      <ChevronDown className="size-3.5 shrink-0" aria-hidden />
                    ) : (
                      <ChevronRight className="size-3.5 shrink-0" aria-hidden />
                    )}
                    <span className="truncate">{g.server.name}</span>
                    <span className="tabular-nums">· {g.tools.length}</span>
                  </button>
                  <Link
                    to="/mcp/$serverId"
                    params={{ serverId: g.server.id }}
                    className="flex shrink-0 items-center px-3 py-1.5 hover:text-foreground"
                    title="Open server"
                  >
                    <ArrowUpRight className="size-3.5" aria-hidden />
                  </Link>
                </div>
                {isOpen(g.server.id) &&
                  g.tools.map((t) => {
                    const f = flags.get(t.name)
                    return (
                      <button
                        key={t.id}
                        type="button"
                        onClick={() => setSelectedId(t.id)}
                        className={cn(
                          'flex w-full flex-col gap-1 border-b px-4 py-2.5 text-left hover:bg-muted/40',
                          selected?.id === t.id && 'bg-muted/60',
                        )}
                      >
                        <span className="flex items-center gap-2">
                          <span className="truncate font-mono text-sm">{t.name}</span>
                          {f?.conflict ? (
                            <Badge variant="destructive">conflict</Badge>
                          ) : f?.duplicate ? (
                            <Badge variant="warning">dup</Badge>
                          ) : null}
                        </span>
                        <ToolFacetBadges facets={facetsFor.get(t.id) ?? []} size="sm" />
                        {t.description && (
                          <span className="line-clamp-1 text-xs text-muted-foreground">{t.description}</span>
                        )}
                      </button>
                    )
                  })}
              </div>
            ))
          )}
        </div>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto">
        {selected ? (
          <ToolDetail tool={selected} servers={servers} />
        ) : (
          <p className="p-6 text-sm text-muted-foreground">Select a tool.</p>
        )}
      </div>
    </div>
  )
}

function ToolDetail({ tool, servers }: { tool: McpTool; servers: McpServer[] }) {
  const alsoOn = servers.filter((s) => s.id !== tool.serverId && s.tools.some((t) => t.name === tool.name))
  return (
    <div className="flex flex-col gap-4 p-4 lg:p-6">
      <div>
        <h2 className="font-mono text-lg font-semibold">{tool.name}</h2>
        {tool.title && tool.title !== tool.name && <p className="text-sm text-muted-foreground">{tool.title}</p>}
      </div>

      <ToolFacetBadges facets={toolFacets(tool, TOOL_TAGS[tool.id] ?? [])} className="gap-1.5" />

      <p className={cn('text-sm leading-relaxed', !tool.description && 'text-muted-foreground')}>
        {tool.description?.trim() || 'No description.'}
      </p>

      {alsoOn.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5 text-sm">
          <span className="text-muted-foreground">Also on</span>
          {alsoOn.map((s) => (
            <Link key={s.id} to="/mcp/$serverId" params={{ serverId: s.id }}>
              <Badge variant="outline">{s.name}</Badge>
            </Link>
          ))}
        </div>
      )}

      {tool.schemaNote && (
        <p className="text-xs text-muted-foreground">
          Schema note: the MCP SDK flags <code className="font-mono">{tool.schemaNote}</code> — legal JSON Schema,
          recovered intact.
        </p>
      )}

      <JsonBlock label="Input schema" value={tool.inputSchema ?? {}} />
    </div>
  )
}
