import { Add01Icon, Search01Icon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { useMemo, useState } from 'react'
import { Badge } from '#/components/ui/badge'
import { Button } from '#/components/ui/button'
import { Input } from '#/components/ui/input'
import type { PromptVersion } from '#/features/inventory/system-prompts/types'
import { cn } from '#/lib/utils'

export function VersionList({
  versions,
  activeVersionId,
  onSelect,
  onNewVersion,
  canCreate,
  className,
}: {
  versions: PromptVersion[]
  activeVersionId: number
  onSelect: (versionId: number) => void
  onNewVersion?: () => void
  canCreate: boolean
  className?: string
}) {
  const [query, setQuery] = useState('')
  const sorted = useMemo(() => [...versions].sort((a, b) => b.version - a.version), [versions])
  const latestVersion = sorted[0]?.version ?? 0

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return sorted
    return sorted.filter(
      (v) =>
        String(v.version).includes(q) || v.author.toLowerCase().includes(q) || v.sourceRef?.toLowerCase().includes(q),
    )
  }, [sorted, query])

  return (
    <div className={cn('flex h-full min-h-0 flex-col', className)}>
      <div className="flex items-center gap-2 border-b p-3">
        <div className="relative flex-1">
          <HugeiconsIcon
            icon={Search01Icon}
            className="pointer-events-none absolute left-2 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground"
            strokeWidth={2}
          />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search…"
            className="h-8 pl-7 text-xs"
          />
        </div>
        {canCreate && onNewVersion && (
          <Button variant="outline" size="sm" onClick={onNewVersion}>
            <HugeiconsIcon icon={Add01Icon} strokeWidth={2} data-icon="inline-start" />
            New
          </Button>
        )}
      </div>
      <div className="flex-1 overflow-y-auto">
        {filtered.length === 0 ? (
          <p className="px-4 py-6 text-center text-xs text-muted-foreground">No versions match.</p>
        ) : (
          <ul className="divide-y">
            {filtered.map((v) => {
              const isActive = v.id === activeVersionId
              const isLatest = v.version === latestVersion
              const created = new Date(v.createdAt)
              return (
                <li key={v.id}>
                  <button
                    type="button"
                    onClick={() => onSelect(v.id)}
                    aria-current={isActive ? 'true' : undefined}
                    className={cn(
                      'flex w-full flex-col gap-1 px-4 py-3 text-left transition-colors outline-none hover:bg-accent/40 focus-visible:bg-accent/40',
                      isActive && 'bg-accent/60',
                    )}
                  >
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-sm font-medium">#{v.version}</span>
                      {isLatest && <Badge variant="default">Latest</Badge>}
                      {v.sourceRef && (
                        <Badge variant="outline" className="font-mono text-[10px]">
                          synced
                        </Badge>
                      )}
                    </div>
                    <span className="text-[11px] text-muted-foreground">
                      {created.toLocaleString(undefined, {
                        month: 'short',
                        day: 'numeric',
                        year: 'numeric',
                        hour: 'numeric',
                        minute: '2-digit',
                      })}{' '}
                      · {v.author}
                    </span>
                    {v.sourceRef && (
                      <span className="truncate font-mono text-[10px] text-muted-foreground" title={v.sourceRef}>
                        {v.sourceRef}
                      </span>
                    )}
                  </button>
                </li>
              )
            })}
          </ul>
        )}
      </div>
    </div>
  )
}
