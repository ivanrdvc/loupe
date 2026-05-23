import { Button } from '#/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '#/components/ui/tooltip'
import { formatAgo } from '#/lib/format'
import { NoteSheetButton } from '#/routes/notes/-components/note-sheet-button'
import type { Prompt, PromptVersion } from '../-types'

export function PromptDetailHeader({
  prompt,
  latestVersion,
  hasChanges,
  saving,
  isLatest,
  activeVersion,
  onSave,
}: {
  prompt: Prompt
  latestVersion: PromptVersion | undefined
  hasChanges: boolean
  saving: boolean
  isLatest: boolean
  activeVersion: number
  onSave: () => void
}) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-3 px-4 lg:px-6">
      <div className="flex flex-col gap-0.5">
        <h1 className="text-lg font-semibold">{prompt.name}</h1>
        <span className="text-xs text-muted-foreground">
          last updated {formatAgo(prompt.updatedAt)} by {latestVersion?.author ?? '—'}
        </span>
      </div>
      <div className="flex items-center gap-3">
        {!isLatest && latestVersion && (
          <Tooltip>
            <TooltipTrigger asChild>
              <span className="cursor-help border-b border-dashed border-muted-foreground/40 text-xs text-muted-foreground">
                Viewing v{activeVersion} · saves on top of v{latestVersion.version}
              </span>
            </TooltipTrigger>
            <TooltipContent side="bottom" className="max-w-xs">
              You're viewing v{activeVersion}, but the latest is v{latestVersion.version}. Saving will create a new
              version on top of v{latestVersion.version} — it won't overwrite the version you're looking at.
            </TooltipContent>
          </Tooltip>
        )}
        <NoteSheetButton targetKind="prompt" targetId={String(prompt.id)} />
        <Button onClick={onSave} disabled={!hasChanges || saving}>
          {saving ? 'Saving…' : 'Save as new version'}
        </Button>
      </div>
    </div>
  )
}
