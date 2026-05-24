import { useMemo } from 'react'
import { cn } from '#/lib/utils'

// Strings (with escapes) optionally followed by `:` for object keys, then
// literals (true/false/null) and numbers. Anything not matched stays plain.
const TOKEN_RE = /("(?:\\.|[^"\\])*")(\s*:)?|\b(true|false|null)\b|(-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)/g

const TOKEN_CLS = {
  key: 'text-sky-700 dark:text-sky-300',
  string: 'text-emerald-700 dark:text-emerald-300',
  literal: 'text-purple-700 dark:text-purple-300',
  number: 'text-amber-700 dark:text-amber-400',
} as const

type Token = { text: string; cls?: string }

function tokenize(code: string): Token[] {
  const out: Token[] = []
  let last = 0
  for (const m of code.matchAll(TOKEN_RE)) {
    const idx = m.index ?? 0
    if (idx > last) out.push({ text: code.slice(last, idx) })
    const [whole, str, colon, literal, number] = m
    if (str) {
      out.push({ text: str, cls: colon ? TOKEN_CLS.key : TOKEN_CLS.string })
      if (colon) out.push({ text: colon })
    } else if (literal) {
      out.push({ text: literal, cls: TOKEN_CLS.literal })
    } else if (number) {
      out.push({ text: number, cls: TOKEN_CLS.number })
    }
    last = idx + whole.length
  }
  if (last < code.length) out.push({ text: code.slice(last) })
  return out
}

interface Props {
  code: string
  language: 'json'
  className?: string
}

export function CodeBlock({ code, className }: Props) {
  const tokens = useMemo(() => tokenize(code), [code])
  return (
    <pre
      className={cn(
        'not-prose w-full min-w-0 max-w-full overflow-auto whitespace-pre-wrap break-words rounded-md border bg-background p-3 font-mono text-xs leading-relaxed text-foreground',
        className,
      )}
    >
      {tokens.map((t, i) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: tokens are derived from immutable code input
        <span key={i} className={t.cls}>
          {t.text}
        </span>
      ))}
    </pre>
  )
}
