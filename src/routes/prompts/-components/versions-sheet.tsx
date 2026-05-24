import { Clock01Icon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { useMemo, useState } from 'react'
import { Badge } from '#/components/ui/badge'
import { Button } from '#/components/ui/button'
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from '#/components/ui/sheet'
import type { PromptVersion } from '../-types'
import { VersionList } from './version-list'

export function VersionsSheet({
  versions,
  activeVersionId,
  onSelect,
  onNewVersion,
  canCreate,
}: {
  versions: PromptVersion[]
  activeVersionId: number
  onSelect: (versionId: number) => void
  onNewVersion?: () => void
  canCreate: boolean
}) {
  const [open, setOpen] = useState(false)
  const latestVersion = useMemo(() => versions.reduce((a, b) => (b.version > a ? b.version : a), 0), [versions])
  const activeVersion = versions.find((v) => v.id === activeVersionId)?.version ?? latestVersion

  const handleSelect = (id: number) => {
    onSelect(id)
    setOpen(false)
  }
  const handleNewVersion = () => {
    onNewVersion?.()
    setOpen(false)
  }

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button variant="outline" size="sm">
          <HugeiconsIcon icon={Clock01Icon} strokeWidth={2} data-icon="inline-start" />
          Versions
          <Badge variant="secondary" className="ml-1 font-mono">
            #{activeVersion}
          </Badge>
        </Button>
      </SheetTrigger>
      <SheetContent side="right" className="flex w-full flex-col gap-0 p-0 sm:max-w-md">
        <SheetHeader className="border-b">
          <SheetTitle>Versions</SheetTitle>
          <SheetDescription>
            {versions.length} {versions.length === 1 ? 'version' : 'versions'}. Click one to load it into the editor.
          </SheetDescription>
        </SheetHeader>
        <VersionList
          versions={versions}
          activeVersionId={activeVersionId}
          onSelect={handleSelect}
          onNewVersion={canCreate ? handleNewVersion : undefined}
          canCreate={canCreate}
          className="min-h-0"
        />
      </SheetContent>
    </Sheet>
  )
}
