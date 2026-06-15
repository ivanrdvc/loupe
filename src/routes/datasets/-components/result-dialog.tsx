import { Link } from '@tanstack/react-router'
import { Link as LinkIcon } from 'lucide-react'
import { Button } from '#/components/ui/button'
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '#/components/ui/dialog'
import { ScrollArea } from '#/components/ui/scroll-area'
import {
  type ChatMessage,
  type DatasetExample,
  type DatasetRunItem,
  inputPreview,
  inputTurns,
} from '#/features/evaluation'
import { cn } from '#/lib/utils'
import { Field, ScoreChips, StatusIcon } from './run-bits'

export function ResultDialog({
  item,
  example,
  onClose,
}: {
  item: DatasetRunItem | null
  example: DatasetExample | null
  onClose: () => void
}) {
  return (
    <Dialog open={!!item} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Run result</DialogTitle>
          <DialogDescription>One example, one run.</DialogDescription>
        </DialogHeader>
        {item && (
          <ScrollArea className="-mx-1 [&>[data-slot=scroll-area-viewport]]:max-h-[70vh]">
            <div className="flex flex-col gap-4 px-1 text-sm">
              <Field label="Input">
                {(() => {
                  const turns = inputTurns(example?.input ?? '')
                  return turns ? <TranscriptView turns={turns} /> : <p>{inputPreview(example?.input ?? '')}</p>
                })()}
              </Field>
              <Field label="Expected">
                <p className="text-muted-foreground">{example?.expected ?? '—'}</p>
              </Field>
              <Field label="Answer">
                <p className="rounded-md border bg-card/40 p-2">
                  {item.status === 'error' ? '— (run failed)' : item.output}
                </p>
              </Field>
              <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                <StatusIcon status={item.status} />
                <span>{(item.latencyMs / 1000).toFixed(1)}s</span>
                <span>· {item.tokens} tok</span>
              </div>
              {item.traceId && (
                <Field label="Trace">
                  <Button asChild variant="link" size="sm" className="h-auto justify-start p-0 font-mono text-xs">
                    <Link to="/traces/$traceId" params={{ traceId: item.traceId }}>
                      open trace {item.traceId}
                      <LinkIcon className="size-3" />
                    </Link>
                  </Button>
                </Field>
              )}
              <Field label="Score">
                {item.status === 'error' ? (
                  <span className="text-xs text-muted-foreground">—</span>
                ) : (
                  <ScoreChips it={item} />
                )}
              </Field>
            </div>
          </ScrollArea>
        )}
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="outline">Close</Button>
          </DialogClose>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

const ROLE_STYLE: Record<ChatMessage['role'], string> = {
  system: 'text-muted-foreground',
  user: 'text-foreground',
  assistant: 'text-primary',
  tool: 'text-warning',
}

/** Read-only transcript (result dialog). */
function TranscriptView({ turns }: { turns: ChatMessage[] }) {
  return (
    <div className="flex flex-col gap-1.5">
      {turns.map((m, i) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: static transcript view
        <div key={i} className="text-sm">
          <span className={cn('mr-1.5 font-mono text-[10px] uppercase tracking-wider', ROLE_STYLE[m.role])}>
            {m.role}
          </span>
          {m.content}
        </div>
      ))}
    </div>
  )
}
