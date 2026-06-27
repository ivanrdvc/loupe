import { Clock, Trash2 } from 'lucide-react'
import { useState, useSyncExternalStore } from 'react'
import { Button } from '#/components/ui/button.tsx'
import { DropdownMenu, DropdownMenuContent, DropdownMenuTrigger } from '#/components/ui/dropdown-menu'
import { cn } from '#/lib/utils'
import { deleteSession, type StoredSession, selectSession, sessionStore } from '../logic/sessions'

function startOfDay(ts: number): number {
  const d = new Date(ts)
  d.setHours(0, 0, 0, 0)
  return d.getTime()
}

function groupByDay(list: StoredSession[]): [string, StoredSession[]][] {
  const today = startOfDay(Date.now())
  const yesterday = today - 86_400_000
  const buckets: Record<string, StoredSession[]> = { Today: [], Yesterday: [], Earlier: [] }
  for (const s of list) {
    const day = startOfDay(s.updatedAt)
    if (day >= today) buckets.Today.push(s)
    else if (day >= yesterday) buckets.Yesterday.push(s)
    else buckets.Earlier.push(s)
  }
  return (['Today', 'Yesterday', 'Earlier'] as const)
    .map((label) => [label, buckets[label]] as [string, StoredSession[]])
    .filter(([, items]) => items.length > 0)
}

export function SessionHistory({ activeId }: { activeId: string }) {
  const [open, setOpen] = useState(false)
  const { sessions } = useSyncExternalStore(
    sessionStore.subscribe,
    sessionStore.getSnapshot,
    sessionStore.getServerSnapshot,
  )
  const groups = groupByDay(sessions)

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="size-7" title="History">
          <Clock className="size-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-72 p-0">
        {sessions.length === 0 ? (
          <p className="px-3 py-6 text-center text-sm text-muted-foreground">No sessions yet</p>
        ) : (
          <div className="max-h-96 overflow-y-auto p-1">
            {groups.map(([label, items]) => (
              <div key={label}>
                <div className="px-2 pt-2 pb-1 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                  {label}
                </div>
                {items.map((s) => (
                  <div
                    key={s.id}
                    className={cn(
                      'group flex items-center gap-1 rounded-md pr-1 text-sm hover:bg-accent',
                      s.id === activeId && 'bg-accent/60',
                    )}
                  >
                    <button
                      type="button"
                      className="min-w-0 flex-1 truncate px-2 py-1.5 text-left"
                      onClick={() => {
                        selectSession(s.id)
                        setOpen(false)
                      }}
                    >
                      {s.title}
                    </button>
                    <button
                      type="button"
                      className="shrink-0 rounded p-1 text-muted-foreground opacity-0 transition-opacity hover:text-destructive group-hover:opacity-100"
                      title="Delete"
                      onClick={() => deleteSession(s.id)}
                    >
                      <Trash2 className="size-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            ))}
          </div>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
