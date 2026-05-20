import { Button } from '#/components/ui/button'
import { formatAgo } from '#/lib/format'
import { NoteSheetButton } from '#/routes/notes/-components/note-sheet-button'
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
    <div className="flex flex-wrap items-start justify-between gap-3 px-4 lg:px-6">
      <div className="flex flex-col gap-0.5">
        <h1 className="text-lg font-semibold">{prompt.name}</h1>
        <span className="text-xs text-muted-foreground">
          last updated {formatAgo(prompt.updatedAt)} by {latest?.author ?? '—'}
        </span>
      </div>
      <div className="flex items-center gap-2">
        <NoteSheetButton targetKind="prompt" targetId={prompt.id} />
        <Button onClick={onSave} disabled={!hasChanges || saving}>
          {saving ? 'Saving…' : 'Save as new version'}
        </Button>
      </div>
    </div>
  )
}
