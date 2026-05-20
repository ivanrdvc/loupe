import { ArrowDown01Icon, ArrowUp01Icon, MoreHorizontalCircle01Icon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { useState } from 'react'
import { Badge } from '#/components/ui/badge'
import { Button } from '#/components/ui/button'
import { Card, CardContent } from '#/components/ui/card'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '#/components/ui/dropdown-menu'
import { Item, ItemActions, ItemContent, ItemGroup, ItemMedia, ItemTitle } from '#/components/ui/item'
import { ScrollArea } from '#/components/ui/scroll-area'
import { Skeleton } from '#/components/ui/skeleton'
import { formatAgo, formatDuration } from '#/lib/format'
import type { PromptRun } from '../-types'

export function RunOutputPanel({
  runs,
  isRunning,
  latestRun,
  onShowDiff,
}: {
  promptId: string
  runs: PromptRun[]
  isRunning: boolean
  latestRun: PromptRun | null
  onShowDiff: (run: PromptRun) => void
}) {
  const [historyOpen, setHistoryOpen] = useState(true)

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-1.5">
        <h3 className="text-sm font-medium">Output</h3>
        <Card size="sm">
          <CardContent>
            {isRunning ? (
              <div className="flex flex-col gap-2">
                <Skeleton className="h-3 w-3/4" />
                <Skeleton className="h-3 w-full" />
                <Skeleton className="h-3 w-5/6" />
                <Skeleton className="h-3 w-2/3" />
              </div>
            ) : latestRun ? (
              <div className="flex flex-col gap-2">
                <div className="whitespace-pre-wrap font-mono text-sm">{latestRun.output}</div>
                <div className="text-xs text-muted-foreground">
                  Ran v{latestRun.versionNumber} • {formatDuration(latestRun.durationMs)} •{' '}
                  {formatAgo(latestRun.createdAt)}
                </div>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">Click Run to execute the current prompt.</p>
            )}
          </CardContent>
        </Card>
      </div>

      <Card size="sm">
        <CardContent className="flex flex-col gap-2">
          <button
            type="button"
            onClick={() => setHistoryOpen((v) => !v)}
            className="flex items-center justify-between text-left text-sm font-medium outline-none"
            aria-expanded={historyOpen}
          >
            <span>Run history</span>
            <HugeiconsIcon
              icon={historyOpen ? ArrowUp01Icon : ArrowDown01Icon}
              strokeWidth={2}
              className="size-4 text-muted-foreground"
            />
          </button>
          {historyOpen &&
            (runs.length === 0 ? (
              <p className="text-xs text-muted-foreground">No runs yet.</p>
            ) : (
              <ScrollArea className="max-h-64">
                <ItemGroup>
                  {runs.map((run, idx) => (
                    <RunHistoryRow key={run.id} run={run} isLatest={idx === 0} onShowDiff={() => onShowDiff(run)} />
                  ))}
                </ItemGroup>
              </ScrollArea>
            ))}
        </CardContent>
      </Card>
    </div>
  )
}

function RunHistoryRow({ run, isLatest, onShowDiff }: { run: PromptRun; isLatest: boolean; onShowDiff: () => void }) {
  const preview = run.output.replace(/\s+/g, ' ').trim().slice(0, 80)
  return (
    <Item size="xs">
      <ItemMedia>
        <Badge variant="secondary" className="font-mono text-[10px]">
          v{run.versionNumber}
        </Badge>
      </ItemMedia>
      <ItemContent>
        <ItemTitle className="font-mono font-normal text-muted-foreground">{preview || '(empty)'}</ItemTitle>
      </ItemContent>
      <ItemActions className="gap-1">
        <span className="text-[11px] tabular-nums text-muted-foreground">{formatAgo(run.createdAt)}</span>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon-sm" aria-label="Run actions">
              <HugeiconsIcon icon={MoreHorizontalCircle01Icon} strokeWidth={2} />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={onShowDiff} disabled={isLatest}>
              Diff vs latest
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </ItemActions>
    </Item>
  )
}
