import { Avatar, AvatarFallback } from '#/components/ui/avatar'
import { Card, CardContent } from '#/components/ui/card'
import { formatAgo } from '#/lib/format'
import { cn } from '#/lib/utils'
import type { PromptVersion } from '../-types'

function initialsFor(name: string): string {
  return name
    .split(/[\s_-]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('')
}

export function VersionRail({
  versions,
  activeVersionId,
  onSelect,
}: {
  versions: PromptVersion[]
  activeVersionId: string
  onSelect: (versionId: string) => void
}) {
  const sorted = [...versions].sort((a, b) => b.version - a.version)
  const latestVersion = sorted[0]?.version ?? 0

  return (
    <div className="flex flex-col gap-2">
      <h3 className="text-sm font-medium">Versions</h3>
      <div className="flex flex-col gap-1.5">
        {sorted.map((v) => {
          const isActive = v.id === activeVersionId
          const isLatest = v.version === latestVersion
          return (
            <button
              key={v.id}
              type="button"
              onClick={() => onSelect(v.id)}
              className="text-left outline-none"
              aria-label={`Load version ${v.version}`}
            >
              <Card
                size="sm"
                className={cn('cursor-pointer transition-colors hover:bg-muted/50', isActive && 'ring-primary')}
              >
                <CardContent className="flex items-center gap-2.5">
                  <Avatar className="size-7">
                    <AvatarFallback className="bg-secondary text-[10px] font-medium text-secondary-foreground">
                      {initialsFor(v.author)}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                    <div className="flex items-center gap-1.5">
                      <span className="font-mono text-xs font-medium">v{v.version}</span>
                      {isLatest && <span className="text-[10px] text-muted-foreground">latest</span>}
                    </div>
                    <span className="text-[11px] text-muted-foreground">{formatAgo(v.createdAt)}</span>
                  </div>
                </CardContent>
              </Card>
            </button>
          )
        })}
      </div>
    </div>
  )
}
