import { ChevronRight } from 'lucide-react'
import { useState } from 'react'
import { cn } from '#/lib/utils'
import { TOKEN_CLS } from './code-block'

const MAX_STRING = 280
const DEFAULT_OPEN_DEPTH = 2

export function JsonTree({ value, className }: { value: unknown; className?: string }) {
  return (
    <div className={cn('not-prose min-w-0 max-w-full font-mono text-xs leading-relaxed', className)}>
      <Node value={value} depth={0} />
    </div>
  )
}

function Node({ name, value, depth }: { name?: string; value: unknown; depth: number }) {
  const [open, setOpen] = useState(depth < DEFAULT_OPEN_DEPTH)
  const isObj = value !== null && typeof value === 'object'
  const entries = isObj ? Object.entries(value as object) : null

  if (!entries || entries.length === 0) {
    return (
      <div className="flex min-w-0 items-start gap-1 py-px pl-4">
        <Key name={name} />
        {entries ? (
          <span className="text-muted-foreground/70">{Array.isArray(value) ? '[]' : '{}'}</span>
        ) : (
          <Primitive value={value} />
        )}
      </div>
    )
  }

  const isArray = Array.isArray(value)
  const count = entries.length

  return (
    <div className="min-w-0">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full min-w-0 cursor-pointer items-center gap-1 rounded py-px text-left hover:bg-muted/60"
      >
        <ChevronRight
          className={cn('size-3 shrink-0 text-muted-foreground/60 transition-transform', open && 'rotate-90')}
          aria-hidden
        />
        <Key name={name} />
        <span className="text-muted-foreground/70">{isArray ? '[' : '{'}</span>
        {!open && (
          <>
            <span className="text-muted-foreground/50">…</span>
            <span className="text-muted-foreground/70">{isArray ? ']' : '}'}</span>
            <span className="ml-1 truncate text-[10px] text-muted-foreground/60">
              {count} {isArray ? (count === 1 ? 'item' : 'items') : count === 1 ? 'key' : 'keys'}
            </span>
          </>
        )}
      </button>
      {open && (
        <>
          <div className="ml-[5px] border-l border-border/60 pl-2.5">
            {entries.map(([k, v]) => (
              <Node key={k} name={k} value={v} depth={depth + 1} />
            ))}
          </div>
          <div className="pl-4 text-muted-foreground/70">{isArray ? ']' : '}'}</div>
        </>
      )}
    </div>
  )
}

function Key({ name }: { name?: string }) {
  if (name === undefined) return null
  const isIndex = /^\d+$/.test(name)
  return (
    <span className="shrink-0">
      <span className={isIndex ? 'text-muted-foreground/60' : TOKEN_CLS.key}>{name}</span>
      <span className="text-muted-foreground/70">:</span>
    </span>
  )
}

function Primitive({ value }: { value: unknown }) {
  if (typeof value === 'string') return <Str value={value} />
  if (typeof value === 'number') return <span className={TOKEN_CLS.number}>{String(value)}</span>
  return <span className={TOKEN_CLS.literal}>{String(value)}</span>
}

function Str({ value }: { value: string }) {
  const [full, setFull] = useState(false)
  const overflow = value.length > MAX_STRING
  const shown = full || !overflow ? value : value.slice(0, MAX_STRING)
  return (
    <span className={cn('min-w-0 whitespace-pre-wrap break-words', TOKEN_CLS.string)}>
      "{shown}
      {overflow && !full ? '…' : '"'}
      {overflow && (
        <button
          type="button"
          onClick={() => setFull((f) => !f)}
          className="ml-1.5 cursor-pointer font-sans text-[10px] text-muted-foreground underline-offset-2 hover:underline"
        >
          {full ? 'less' : `+${(value.length - MAX_STRING).toLocaleString('en-US')} chars`}
        </button>
      )}
    </span>
  )
}
