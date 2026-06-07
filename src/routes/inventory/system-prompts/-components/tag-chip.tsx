import { Cancel01Icon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import type { Tag } from '#/features/inventory/system-prompts/types'
import { cn } from '#/lib/utils'
import { tagColorClass } from './tag-utils'

export function TagChip({ tag, onRemove, className }: { tag: Tag; onRemove?: () => void; className?: string }) {
  return (
    <span
      className={cn(
        'inline-flex h-5 items-center gap-1 rounded-full border px-2 text-[11px] font-medium',
        tagColorClass(tag.color),
        className,
      )}
    >
      <span className="truncate">{tag.name}</span>
      {onRemove && (
        <button
          type="button"
          onClick={onRemove}
          className="-mr-0.5 rounded-full opacity-70 transition-opacity hover:opacity-100"
          aria-label={`Remove tag ${tag.name}`}
        >
          <HugeiconsIcon icon={Cancel01Icon} strokeWidth={2} className="size-3" />
        </button>
      )}
    </span>
  )
}
