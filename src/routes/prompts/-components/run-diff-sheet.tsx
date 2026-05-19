import { useMemo } from 'react'
import { Badge } from '#/components/ui/badge'
import { ScrollArea } from '#/components/ui/scroll-area'
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '#/components/ui/sheet'
import { formatAgo, formatDuration } from '#/lib/format'
import { cn } from '#/lib/utils'
import type { PromptRun } from '../-types'

export function RunDiffSheet({
  open,
  onOpenChange,
  runA,
  runB,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  runA: PromptRun | null
  runB: PromptRun | null
}) {
  const diffKeys = useMemo(() => {
    if (!runA || !runB) return new Set<string>()
    const keys = new Set([...Object.keys(runA.varValues), ...Object.keys(runB.varValues)])
    const out = new Set<string>()
    for (const k of keys) {
      if ((runA.varValues[k] ?? '') !== (runB.varValues[k] ?? '')) out.add(k)
    }
    return out
  }, [runA, runB])

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="flex w-full flex-col gap-0 sm:max-w-4xl">
        <SheetHeader>
          <SheetTitle>Compare runs</SheetTitle>
        </SheetHeader>
        <div className="grid min-h-0 flex-1 grid-cols-2 gap-4 p-4 pt-0">
          <RunColumn run={runA} label="Selected" diffKeys={diffKeys} />
          <RunColumn run={runB} label="Latest" diffKeys={diffKeys} />
        </div>
      </SheetContent>
    </Sheet>
  )
}

function RunColumn({ run, label, diffKeys }: { run: PromptRun | null; label: string; diffKeys: Set<string> }) {
  if (!run) {
    return (
      <div className="flex flex-col gap-2">
        <span className="text-xs text-muted-foreground">{label} — no run</span>
      </div>
    )
  }

  const varEntries = Object.entries(run.varValues)

  return (
    <div className="flex min-h-0 flex-col gap-2">
      <div className="flex items-center gap-2">
        <Badge variant="secondary" className="font-mono text-[10px]">
          v{run.versionNumber}
        </Badge>
        <span className="text-xs text-muted-foreground">
          {label} • {formatAgo(run.createdAt)} • {formatDuration(run.durationMs)}
        </span>
      </div>

      {varEntries.length > 0 && (
        <div className="flex flex-col gap-1 rounded-md border p-2 text-xs">
          {varEntries.map(([key, value]) => (
            <div
              key={key}
              className={cn(
                'flex gap-2 rounded px-1 py-0.5',
                diffKeys.has(key) && 'bg-amber-100/60 dark:bg-amber-900/20',
              )}
            >
              <span className="shrink-0 font-mono text-muted-foreground">{key}:</span>
              <span className="min-w-0 break-all font-mono">
                {value || <em className="text-muted-foreground">empty</em>}
              </span>
            </div>
          ))}
        </div>
      )}

      <ScrollArea className="min-h-0 flex-1 rounded-md border">
        <div className="whitespace-pre-wrap p-3 font-mono text-xs">{run.output}</div>
      </ScrollArea>
    </div>
  )
}
