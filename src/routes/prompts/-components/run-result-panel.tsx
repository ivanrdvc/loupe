import { Markdown } from '#/components/markdown'
import { Badge } from '#/components/ui/badge'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '#/components/ui/collapsible'
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from '#/components/ui/empty'
import { Skeleton } from '#/components/ui/skeleton'
import type { RunLiveOutput } from '#/server/prompt-run'

type Props = {
  result: RunLiveOutput | null
  isRunning: boolean
  error: string | null
}

export function RunResultPanel({ result, isRunning, error }: Props) {
  if (isRunning) {
    return (
      <div className="flex flex-col gap-2">
        <Skeleton className="h-4 w-32" />
        <Skeleton className="h-24 w-full" />
      </div>
    )
  }

  if (error) {
    return (
      <Empty>
        <EmptyHeader>
          <EmptyTitle>Run failed</EmptyTitle>
          <EmptyDescription className="font-mono text-xs whitespace-pre-wrap text-left">{error}</EmptyDescription>
        </EmptyHeader>
      </Empty>
    )
  }

  if (!result) {
    return (
      <div className="text-xs text-muted-foreground">No runs yet. Click Run to send these messages to your agent.</div>
    )
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <Badge variant="secondary" className="font-mono">
          {result.durationMs}ms
        </Badge>
        <span>live</span>
      </div>
      <div className="rounded-lg border bg-card p-4">
        {result.text ? (
          <Markdown>{result.text}</Markdown>
        ) : (
          <div className="text-xs text-muted-foreground">Response had no text output. See raw JSON below.</div>
        )}
      </div>
      <Collapsible>
        <CollapsibleTrigger className="text-xs text-muted-foreground hover:text-foreground">
          Show raw response
        </CollapsibleTrigger>
        <CollapsibleContent>
          <pre className="mt-2 overflow-auto rounded-md border bg-muted/40 p-3 font-mono text-[11px]">
            {result.rawJson}
          </pre>
        </CollapsibleContent>
      </Collapsible>
    </div>
  )
}
