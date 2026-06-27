import { Badge } from '#/components/ui/badge'
import { cn } from '#/lib/utils'
import type { ToolFacet } from '../logic/facets'

export function ToolFacetBadges({
  facets,
  className,
  size = 'default',
}: {
  facets: readonly ToolFacet[]
  className?: string
  size?: 'default' | 'sm'
}) {
  if (facets.length === 0) return null
  return (
    <span className={cn('flex flex-wrap gap-1', className)}>
      {facets.map((f) => (
        <Badge
          key={f.id}
          variant={f.tone}
          className={cn('font-normal', size === 'sm' && 'px-1 text-[10px]')}
          title={f.description}
        >
          {f.label}
        </Badge>
      ))}
    </span>
  )
}
