import { Link } from '@tanstack/react-router'
import { ArrowUpRight, ChevronDown, ChevronRight, Search } from 'lucide-react'
import { useMemo, useState } from 'react'
import { JsonBlock } from '#/components/ai-elements/json-block'
import { Badge } from '#/components/ui/badge'
import { Input } from '#/components/ui/input'
import {
  aggregateTools,
  deriveSignals,
  type McpServer,
  type McpTool,
  type McpToolAnnotations,
  TOOL_SIGNAL_DESCRIPTIONS,
  TOOL_TAGS,
} from '#/features/mcp'
import { cn } from '#/lib/utils'

const HINTS = [
  { key: 'readOnlyHint', label: 'read-only' },
  { key: 'destructiveHint', label: 'destructive' },
  { key: 'idempotentHint', label: 'idempotent' },
  { key: 'openWorldHint', label: 'open-world' },
] as const

export function ToolsBrowser({ servers }: { servers: McpServer[] }) {
  const [query, setQuery] = useState('')
  const [facets, setFacets] = useState<Set<string>>(new Set())
  const [selectedId, setSelectedId] = useState<string | null>(null)

  const flags = useMemo(() => {
    const m = new Map<string, { duplicate: boolean; conflict: boolean }>()
    for (const u of aggregateTools(servers)) m.set(u.name, { duplicate: u.duplicate, conflict: u.conflict })
    return m
  }, [servers])

  const attrsFor = useMemo(() => {
    const m = new Map<string, string[]>()
    for (const server of servers) {
      for (const tool of server.tools) m.set(tool.id, [...deriveSignals(tool), ...(TOOL_TAGS[tool.id] ?? [])])
    }
    return m
  }, [servers])

  // Available filter chips: every signal/tag present across the registry.
  const facetOptions = useMemo(() => {
    const set = new Set<string>()
    for (const attrs of attrsFor.values()) for (const a of attrs) set.add(a)
    return [...set].sort()
  }, [attrsFor])

  const groups = useMemo(() => {
    const q = query.trim().toLowerCase()
    const wanted = [...facets]
    return servers
      .map((server) => ({
        server,
        tools: server.tools.filter((t) => {
          if (q && !t.name.toLowerCase().includes(q) && !t.title?.toLowerCase().includes(q)) return false
          const attrs = attrsFor.get(t.id) ?? []
          return wanted.every((w) => attrs.includes(w))
        }),
      }))
      .filter((g) => g.tools.length > 0)
  }, [servers, query, facets, attrsFor])

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
        {facetOptions.length > 0 && (
          <div className="flex flex-wrap gap-1 px-3 pb-2">
            {facetOptions.map((f) => (
              <button key={f} type="button" onClick={() => toggleFacet(f)}>
                <Badge variant={facets.has(f) ? 'default' : 'outline'} className="cursor-pointer font-normal">
                  {f}
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
                    const unbounded = (attrsFor.get(t.id) ?? []).includes('unbounded')
                    return (
                      <button
                        key={t.id}
                        type="button"
                        onClick={() => setSelectedId(t.id)}
                        className={cn(
                          'flex w-full flex-col gap-0.5 border-b px-4 py-2.5 text-left hover:bg-muted/40',
                          selected?.id === t.id && 'bg-muted/60',
                        )}
                      >
                        <span className="flex items-center gap-2">
                          <span className="truncate font-mono text-sm">{t.name}</span>
                          {unbounded && <Badge variant="warning">unbounded</Badge>}
                          {f?.conflict ? (
                            <Badge variant="destructive">conflict</Badge>
                          ) : f?.duplicate ? (
                            <Badge variant="warning">dup</Badge>
                          ) : null}
                        </span>
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
  const signals = deriveSignals(tool)
  const tags = TOOL_TAGS[tool.id] ?? []
  return (
    <div className="flex flex-col gap-4 p-4 lg:p-6">
      <div>
        <h2 className="font-mono text-lg font-semibold">{tool.name}</h2>
        {tool.title && tool.title !== tool.name && <p className="text-sm text-muted-foreground">{tool.title}</p>}
      </div>

      <Annotations annotations={tool.annotations} />

      {signals.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {signals.map((s) => (
            <Badge
              key={s}
              variant={s === 'unbounded' || s === 'bulk' ? 'warning' : 'outline'}
              title={TOOL_SIGNAL_DESCRIPTIONS[s]}
            >
              {s}
            </Badge>
          ))}
        </div>
      )}

      {tags.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {tags.map((tag) => (
            <Badge key={tag} variant="secondary" className="font-normal">
              {tag}
            </Badge>
          ))}
        </div>
      )}

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

      <JsonBlock label="Input schema" value={tool.inputSchema ?? {}} />
    </div>
  )
}

function Annotations({ annotations }: { annotations?: McpToolAnnotations }) {
  if (!annotations) return null
  const active = HINTS.filter((h) => annotations[h.key])
  if (active.length === 0) return null
  return (
    <div className="flex flex-wrap gap-1.5">
      {active.map((h) => (
        <Badge key={h.key} variant="outline" className="capitalize">
          {h.label}
        </Badge>
      ))}
    </div>
  )
}
