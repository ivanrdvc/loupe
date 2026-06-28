import { useQuery } from '@tanstack/react-query'
import { AlertTriangle, MessagesSquare, Workflow } from 'lucide-react'
import { type KeyboardEvent, type RefObject, useCallback, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { formatRelative, shortId } from '#/lib/format'
import { DEFAULT } from '#/lib/time-range'
import { cn } from '#/lib/utils'
import { sessionsQuery } from '#/routes/sessions/-data'
import { tracesQuery } from '#/routes/traces/-data'
import type { MentionRef } from '../logic/request'

interface MentionItem extends MentionRef {
  haystack: string
  sub: string
  hasError: boolean
  when: number
}

// Matches an in-progress "@query" ending at the caret.
const TRIGGER = /(?:^|\s)@([^\s@]{0,80})$/
const MAX_ROWS = 8

function detectTrigger(value: string, caret: number): { query: string; start: number } | null {
  const m = TRIGGER.exec(value.slice(0, caret))
  if (!m) return null
  return { query: m[1], start: caret - m[1].length - 1 }
}

export interface MentionPicker {
  menu: React.ReactNode
  handleChange: (e: React.ChangeEvent<HTMLTextAreaElement>) => void
  handleKeyDown: (e: KeyboardEvent<HTMLTextAreaElement>) => void
  /**
   * Active references whose inserted token is still present in the input.
   */
  selected: MentionRef[]
  /**
   * The `@label` tokens to tint inline behind the textarea.
   */
  tokens: string[]
  reset: () => void
}

export function useMentionPicker(
  value: string,
  setValue: (v: string) => void,
  textareaRef: RefObject<HTMLTextAreaElement | null>,
): MentionPicker {
  const [trigger, setTrigger] = useState<{ query: string; start: number } | null>(null)
  const [active, setActive] = useState(0)
  const [picks, setPicks] = useState<Array<{ token: string } & MentionRef>>([])
  const caretAfterInsert = useRef<number | null>(null)

  const open = trigger !== null
  // Prefetch so the menu has rows the instant "@" is typed (no click-only race).
  const sessions = useQuery(sessionsQuery())
  const traces = useQuery(tracesQuery(DEFAULT))
  const loading = open && (sessions.isLoading || traces.isLoading)

  const items = useMemo<MentionItem[]>(() => {
    if (!trigger) return []
    const all: MentionItem[] = []
    for (const s of sessions.data?.sessions ?? [])
      all.push({
        kind: 'session',
        id: s.sessionId,
        label: s.title || s.firstInput || shortId(s.sessionId),
        haystack: `${s.firstInput ?? ''} ${s.title ?? ''} ${s.agents.join(' ')} ${s.sessionId}`.toLowerCase(),
        sub: [s.userName, s.agents[0]].filter(Boolean).join(' · '),
        hasError: !!s.hasError,
        when: s.lastSeenMs,
      })
    for (const t of traces.data?.traces ?? [])
      all.push({
        kind: 'trace',
        id: t.id,
        label: t.rootOperation || t.agent || shortId(t.id),
        haystack: `${t.rootOperation ?? ''} ${t.agent ?? ''} ${t.serviceName ?? ''} ${t.id}`.toLowerCase(),
        sub: [t.agent, t.serviceName].filter(Boolean).join(' · '),
        hasError: !!t.hasError,
        when: t.startedAtMs,
      })
    const q = trigger.query.toLowerCase()
    return (q ? all.filter((i) => i.haystack.includes(q)) : all).slice(0, MAX_ROWS)
  }, [trigger, sessions.data, traces.data])

  const close = useCallback(() => setTrigger(null), [])

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      const next = e.currentTarget.value
      setValue(next)
      setPicks((prev) => prev.filter((p) => next.includes(p.token)))
      setTrigger(detectTrigger(next, e.currentTarget.selectionStart ?? next.length))
      setActive(0)
    },
    [setValue],
  )

  const pick = useCallback(
    (item: MentionItem) => {
      if (!trigger) return
      const token = `@${item.label}`
      const before = value.slice(0, trigger.start)
      const after = value.slice(trigger.start + 1 + trigger.query.length)
      const inserted = `${token} `
      setPicks((prev) =>
        prev.some((p) => p.id === item.id)
          ? prev
          : [...prev, { token, kind: item.kind, id: item.id, label: item.label }],
      )
      caretAfterInsert.current = before.length + inserted.length
      setValue(before + inserted + after)
      close()
    },
    [trigger, value, setValue, close],
  )

  // Controlled value resets the caret to the end; put it back after the insert.
  useLayoutEffect(() => {
    const pos = caretAfterInsert.current
    if (pos == null) return
    caretAfterInsert.current = null
    const el = textareaRef.current
    if (el) {
      el.focus()
      el.setSelectionRange(pos, pos)
    }
  }, [textareaRef])

  const handleKeyDown = useCallback(
    (e: KeyboardEvent<HTMLTextAreaElement>) => {
      if (!open) return
      // While the menu is open these keys drive it — always swallow them so the
      // textarea doesn't submit, newline, or lose focus on Tab.
      if (e.key === 'Escape') {
        e.preventDefault()
        close()
      } else if (e.key === 'ArrowDown') {
        e.preventDefault()
        if (items.length) setActive((i) => (i + 1) % items.length)
      } else if (e.key === 'ArrowUp') {
        e.preventDefault()
        if (items.length) setActive((i) => (i - 1 + items.length) % items.length)
      } else if (e.key === 'Enter' || e.key === 'Tab') {
        e.preventDefault()
        if (items.length) pick(items[Math.min(active, items.length - 1)])
      }
    },
    [open, items, active, pick, close],
  )

  const activePicks = useMemo(() => {
    const seen = new Set<string>()
    const out: typeof picks = []
    for (const p of picks) {
      if (!value.includes(p.token) || seen.has(p.id)) continue
      seen.add(p.id)
      out.push(p)
    }
    return out
  }, [picks, value])

  const reset = useCallback(() => {
    setPicks([])
    close()
  }, [close])

  const menu = open ? (
    <MentionMenu
      items={items}
      active={active}
      loading={loading}
      query={trigger.query}
      onPick={pick}
      onHover={setActive}
    />
  ) : null

  return {
    menu,
    handleChange,
    handleKeyDown,
    selected: activePicks.map((p) => ({ kind: p.kind, id: p.id, label: p.label })),
    tokens: activePicks.map((p) => p.token),
    reset,
  }
}

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

// A transparent twin of the textarea, aligned char-for-char, that paints a
// rounded tint behind each @mention token. The real text shows on top.
export function MentionBackdrop({
  value,
  tokens,
  className,
  ref,
}: {
  value: string
  tokens: string[]
  className?: string
  ref?: RefObject<HTMLDivElement | null>
}) {
  const parts = useMemo(() => {
    if (!tokens.length) return [value]
    const re = new RegExp(
      `(${[...tokens]
        .sort((a, b) => b.length - a.length)
        .map(escapeRe)
        .join('|')})`,
      'g',
    )
    return value.split(re)
  }, [value, tokens])
  return (
    <div
      ref={ref}
      aria-hidden
      className={cn(
        'pointer-events-none absolute inset-0 overflow-hidden whitespace-pre-wrap break-words border border-transparent text-transparent',
        className,
      )}
    >
      {parts.map((part, i) =>
        tokens.includes(part) ? (
          // biome-ignore lint/suspicious/noArrayIndexKey: positional text segments
          <mark key={i} className="rounded bg-primary/30 text-transparent">
            {part}
          </mark>
        ) : (
          part
        ),
      )}
    </div>
  )
}

function MentionMenu({
  items,
  active,
  loading,
  query,
  onPick,
  onHover,
}: {
  items: MentionItem[]
  active: number
  loading: boolean
  query: string
  onPick: (item: MentionItem) => void
  onHover: (i: number) => void
}) {
  const heading = loading
    ? 'Searching…'
    : query
      ? `${items.length} ${items.length === 1 ? 'match' : 'matches'} for “${query}”`
      : 'Recent sessions & traces'
  return (
    <div className="absolute right-0 bottom-full left-0 z-50 mb-2 overflow-hidden rounded-xl border bg-popover shadow-lg">
      <div className="truncate border-b px-3 py-1.5 text-[11px] font-medium text-muted-foreground">{heading}</div>
      {loading && items.length === 0 ? (
        <div className="px-3 py-3 text-sm text-muted-foreground">Searching runs…</div>
      ) : items.length === 0 ? (
        <div className="px-3 py-3 text-sm text-muted-foreground">No matching runs</div>
      ) : (
        <ul className="max-h-72 overflow-y-auto py-1">
          {items.map((item, i) => {
            const Icon = item.kind === 'session' ? MessagesSquare : Workflow
            return (
              <li key={`${item.kind}:${item.id}`}>
                <button
                  type="button"
                  // mousedown, not click — keep textarea focus through the pick
                  onMouseDown={(e) => {
                    e.preventDefault()
                    onPick(item)
                  }}
                  onMouseMove={() => onHover(i)}
                  className={cn('flex w-full items-center gap-2.5 px-3 py-1.5 text-left', i === active && 'bg-accent')}
                >
                  <span className="grid size-7 shrink-0 place-items-center rounded-md border bg-muted/40 text-muted-foreground">
                    <Icon className="size-3.5" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-1.5">
                      <span className="truncate text-[13px] font-medium">{item.label}</span>
                      {item.hasError && <AlertTriangle className="size-3 shrink-0 text-destructive" />}
                    </span>
                    {item.sub && <span className="block truncate text-xs text-muted-foreground">{item.sub}</span>}
                  </span>
                  <span className="shrink-0 text-[11px] text-muted-foreground tabular-nums">
                    {formatRelative(item.when)}
                  </span>
                </button>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
