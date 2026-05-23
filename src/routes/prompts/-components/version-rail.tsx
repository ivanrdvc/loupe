import { Badge } from '#/components/ui/badge'
import { formatAgo } from '#/lib/format'
import { cn } from '#/lib/utils'
import type { PromptVersion } from '../-types'

export function VersionRail({
  versions,
  activeVersionId,
  onSelect,
}: {
  versions: PromptVersion[]
  activeVersionId: number
  onSelect: (versionId: number) => void
}) {
  const sorted = [...versions].sort((a, b) => b.version - a.version)
  const latestVersion = sorted[0]?.version ?? 0

  return (
    <div className="flex flex-col gap-2">
      <h3 className="text-sm font-medium">Versions</h3>
      <div className="flex flex-col gap-0.5">
        {sorted.map((v) => {
          const isActive = v.id === activeVersionId
          const isLatest = v.version === latestVersion
          return (
            <button
              key={v.id}
              type="button"
              onClick={() => onSelect(v.id)}
              aria-label={`Load version ${v.version}`}
              className={cn(
                'flex w-full items-center justify-between gap-2 rounded-md px-2 py-1.5 text-left text-sm transition-colors outline-none hover:bg-accent hover:text-accent-foreground focus-visible:ring-2 focus-visible:ring-ring',
                isActive && 'bg-accent text-accent-foreground',
              )}
            >
              <div className="flex min-w-0 items-center gap-2">
                <span className="font-mono font-medium">v{v.version}</span>
                {isLatest && <Badge variant="secondary">latest</Badge>}
                <span className="truncate text-muted-foreground">{v.author}</span>
              </div>
              <span className="shrink-0 text-muted-foreground">{formatAgo(v.createdAt)}</span>
            </button>
          )
        })}
      </div>
    </div>
  )
}
