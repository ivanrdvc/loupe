import { Copy01Icon, LockedIcon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import type { ReactNode } from 'react'
import { Badge } from '#/components/ui/badge'
import { Button } from '#/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '#/components/ui/tooltip'
import { NoteSheetButton } from '#/routes/notes/-components/note-sheet-button'
import type { Prompt, PromptVersion } from '../-types'
import { TagPicker } from './tag-picker'

export function PromptDetailActions({
  hasChanges,
  saving,
  isSystem,
  onSave,
  onDuplicate,
  promptId,
  versionsSlot,
}: {
  hasChanges: boolean
  saving: boolean
  isSystem: boolean
  onSave: () => void
  onDuplicate: () => void
  promptId: number
  versionsSlot?: ReactNode
}) {
  return (
    <>
      <NoteSheetButton targetKind="prompt" targetId={String(promptId)} />
      {versionsSlot}
      <Button variant="outline" size="sm" onClick={onDuplicate}>
        <HugeiconsIcon icon={Copy01Icon} strokeWidth={2} data-icon="inline-start" />
        Duplicate
      </Button>
      {!isSystem && (
        <Button size="sm" onClick={onSave} disabled={!hasChanges || saving}>
          {saving ? 'Saving…' : 'Save as new version'}
        </Button>
      )}
    </>
  )
}

export function PromptDetailMeta({
  prompt,
  latestVersion,
  isLatest,
  activeVersion,
  isSystem,
}: {
  prompt: Prompt
  latestVersion: PromptVersion | undefined
  isLatest: boolean
  activeVersion: number
  isSystem: boolean
}) {
  const showSaveHint = !isSystem && !isLatest && latestVersion
  return (
    <div className="flex flex-wrap items-center gap-3">
      <Badge variant="secondary" className="font-mono">
        v{activeVersion}
      </Badge>
      {isSystem && (
        <Tooltip>
          <TooltipTrigger asChild>
            <Badge variant="outline" className="gap-1" aria-label="System prompt — locked">
              <HugeiconsIcon icon={LockedIcon} strokeWidth={2} className="size-3" />
              System
            </Badge>
          </TooltipTrigger>
          <TooltipContent side="bottom" className="max-w-xs">
            System prompts are managed in code. Duplicate to a user folder to experiment.
          </TooltipContent>
        </Tooltip>
      )}
      {showSaveHint && <span className="text-xs text-muted-foreground">saves on top of v{latestVersion.version}</span>}
      <TagPicker promptId={prompt.id} selectedIds={prompt.tagIds} />
    </div>
  )
}
