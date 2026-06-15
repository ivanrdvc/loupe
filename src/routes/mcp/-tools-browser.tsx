import { Link } from '@tanstack/react-router'
import { Search } from 'lucide-react'
import { useMemo, useState } from 'react'
import { JsonView } from '#/components/ai-elements/json-view'
import { Badge } from '#/components/ui/badge'
import { Input } from '#/components/ui/input'
import { aggregateTools, type McpServer, type McpToolAnnotations, type UniqueTool } from '#/features/mcp'
import { cn } from '#/lib/utils'

const HINTS = [
  { key: 'readOnlyHint', label: 'Read-only' },
  { key: 'destructiveHint', label: 'Destructive' },
  { key: 'idempotentHint', label: 'Idempotent' },
  { key: 'openWorldHint', label: 'Open-world' },
] as const

export function ToolsBrowser({ servers }: { servers: McpServer[] }) {
  const tools = useMemo(() => aggregateTools(servers), [servers])
  const [query, setQuery] = useState('')
  const [selectedName, setSelectedName] = useState<string | null>(null)

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return tools
    return tools.filter((t) => t.name.toLowerCase().includes(q) || t.title?.toLowerCase().includes(q))
  }, [tools, query])

  const selected = tools.find((t) => t.name === selectedName) ?? filtered[0] ?? null

  return (
    <div className="flex min-h-0 flex-1">
      <div className="flex w-72 shrink-0 flex-col border-r lg:w-80">
        <div className="relative p-3">
          <Search
            className="pointer-events-none absolute top-1/2 left-5 size-3.5 -translate-y-1/2 text-muted-foreground"
            aria-hidden
          />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Filter tools…"
            className="h-8 border-border bg-transparent pl-7 dark:bg-input/30"
          />
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto">
          {filtered.length === 0 ? (
            <p className="px-4 py-3 text-sm text-muted-foreground">No tools.</p>
          ) : (
            filtered.map((t) => (
              <button
                key={t.name}
                type="button"
                onClick={() => setSelectedName(t.name)}
                className={cn(
                  'flex w-full flex-col gap-0.5 border-b px-4 py-3 text-left hover:bg-muted/40',
                  selected?.name === t.name && 'bg-muted/60',
                )}
              >
                <span className="flex items-center gap-2">
                  <span className="truncate font-medium">{t.title ?? t.name}</span>
                  {t.conflict ? (
                    <Badge variant="destructive">conflict</Badge>
                  ) : t.duplicate ? (
                    <Badge variant="warning">{t.providers.length}</Badge>
                  ) : null}
                </span>
                <span className="line-clamp-2 text-xs text-muted-foreground">
                  {t.providers[0]?.tool.description ?? '—'}
                </span>
              </button>
            ))
          )}
        </div>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto">
        {selected ? (
          <ToolDetail tool={selected} />
        ) : (
          <p className="p-6 text-sm text-muted-foreground">Select a tool.</p>
        )}
      </div>
    </div>
  )
}

function ToolDetail({ tool }: { tool: UniqueTool }) {
  const hasTitle = tool.title && tool.title !== tool.name
  return (
    <div className="flex flex-col gap-4 p-4 lg:p-6">
      <div>
        <h2 className="text-lg font-semibold">{tool.title ?? tool.name}</h2>
        {hasTitle && <p className="font-mono text-xs text-muted-foreground">{tool.name}</p>}
      </div>

      <Annotations annotations={tool.providers[0]?.tool.annotations} />

      <div className="flex flex-wrap items-center gap-1.5 text-sm">
        <span className="text-muted-foreground">Provided by</span>
        {tool.providers.map((p) => (
          <Link key={p.serverId} to="/mcp/$serverId" params={{ serverId: p.serverId }}>
            <Badge variant="outline">{p.serverName}</Badge>
          </Link>
        ))}
      </div>

      {tool.providers.map((p) => (
        <section key={p.serverId} className="flex flex-col gap-2">
          {tool.providers.length > 1 && <h3 className="text-sm font-medium text-muted-foreground">{p.serverName}</h3>}
          <p className={cn('text-sm', !p.tool.description && 'text-muted-foreground')}>
            {p.tool.description || 'No description.'}
          </p>
          <div>
            <p className="pb-1 text-xs font-medium text-muted-foreground">Input schema</p>
            <JsonView value={p.tool.inputSchema ?? {}} />
          </div>
        </section>
      ))}
    </div>
  )
}

function Annotations({ annotations }: { annotations?: McpToolAnnotations }) {
  if (!annotations) return null
  const shown = HINTS.filter((h) => annotations[h.key] !== undefined)
  if (shown.length === 0) return null
  return (
    <div className="flex flex-wrap gap-1.5">
      {shown.map((h) => (
        <Badge key={h.key} variant={annotations[h.key] ? 'secondary' : 'outline'}>
          {annotations[h.key] ? '✓' : '✗'} {h.label}
        </Badge>
      ))}
    </div>
  )
}
