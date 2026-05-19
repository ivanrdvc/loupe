import { ArrowLeft01Icon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { Link } from '@tanstack/react-router'
import { Button } from '#/components/ui/button'
import { formatAgo } from '#/lib/format'
import type { Prompt } from '../-types'

export function PromptDetailHeader({
  prompt,
  hasChanges,
  saving,
  onSave,
}: {
  prompt: Prompt
  hasChanges: boolean
  saving: boolean
  onSave: () => void
}) {
  const latest = prompt.versions[prompt.versions.length - 1]
  return (
    <div className="flex flex-col gap-2 px-4 lg:px-6">
      <Link
        to="/prompts"
        className="inline-flex w-fit items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
      >
        <HugeiconsIcon icon={ArrowLeft01Icon} strokeWidth={2} className="size-3.5" />
        Prompts
      </Link>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex flex-col gap-0.5">
          <h1 className="text-lg font-semibold">{prompt.name}</h1>
          <span className="text-xs text-muted-foreground">
            last updated {formatAgo(prompt.updatedAt)} by {latest?.author ?? '—'}
          </span>
        </div>
        <Button onClick={onSave} disabled={!hasChanges || saving}>
          {saving ? 'Saving…' : 'Save as new version'}
        </Button>
      </div>
    </div>
  )
}
