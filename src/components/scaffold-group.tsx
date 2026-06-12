import { ChevronDown, ChevronRight } from 'lucide-react'
import { useState } from 'react'
import { Markdown } from '#/components/markdown'
import { looksLikeAgui, type ScaffoldMessage } from '#/lib/agui-scaffolding'
import { formatTime } from '#/lib/format'

// Collapsed row for AG-UI scaffolding (state-sync system messages + JSON state
// dumps echoed by the model). Classification rules live in
// `src/lib/agui-scaffolding.ts`.
export function ScaffoldGroup({ messages }: { messages: ScaffoldMessage[] }) {
  const [open, setOpen] = useState(false)
  const first = messages[0]
  const last = messages[messages.length - 1]
  const aguiCount = messages.filter(looksLikeAgui).length
  const isAgui = aguiCount >= Math.ceil(messages.length / 2)
  const onlySystem = messages.every((m) => m.role === 'system')
  const label = isAgui ? 'State sync' : onlySystem ? 'System context' : 'Scaffold'
  return (
    <div className="rounded-md border bg-muted/40 text-xs">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-2 rounded-md px-3 py-1.5 text-left text-muted-foreground hover:bg-accent/50"
      >
        {open ? <ChevronDown className="size-3" aria-hidden /> : <ChevronRight className="size-3" aria-hidden />}
        {isAgui && (
          <span className="rounded bg-muted px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider text-muted-foreground ring-1 ring-border">
            ag-ui
          </span>
        )}
        <span className="text-[10px] font-semibold uppercase tracking-wider">{label}</span>
        <span className="text-[10px]">· {messages.length} messages</span>
        <span className="ml-auto text-[10px]">
          {formatTime(first.timestamp)}
          {last.timestamp !== first.timestamp ? ` – ${formatTime(last.timestamp)}` : ''}
        </span>
      </button>
      {open && (
        <div className="flex flex-col gap-2 border-border border-t px-3 py-2">
          {messages.map((m) => (
            <div key={`${m.spanId ?? ''}-${m.seq}`} className="flex flex-col gap-1 text-[11px] text-foreground">
              <span className="text-[9px] font-semibold uppercase tracking-wider text-muted-foreground">{m.role}</span>
              <Markdown>{m.content}</Markdown>
              <div className="text-[10px] text-muted-foreground">{formatTime(m.timestamp)}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
