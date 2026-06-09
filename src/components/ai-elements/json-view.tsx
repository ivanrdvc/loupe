import { looksLikeJson, parseJson, prettyJson } from '#/lib/json'
import { cn } from '#/lib/utils'
import { CodeBlock } from './code-block'

interface Props {
  value: unknown
  className?: string
}

export function JsonView({ value, className }: Props) {
  if (value === null || value === undefined) return null

  if (typeof value === 'string') {
    const parsed = parseJson(value)
    if (parsed !== undefined && parsed !== null && typeof parsed === 'object') {
      return <CodeBlock code={prettyJson(parsed)} language="json" className={className} />
    }
    if (looksLikeJson(value)) {
      return <CodeBlock code={value} language="json" className={className} />
    }
    return (
      <pre
        className={cn(
          'not-prose w-full min-w-0 max-w-full overflow-auto whitespace-pre-wrap break-words rounded-md border bg-background p-3 font-mono text-xs leading-relaxed text-foreground',
          className,
        )}
      >
        {value}
      </pre>
    )
  }

  if (typeof value !== 'object') {
    return (
      <pre
        className={cn(
          'not-prose w-full min-w-0 max-w-full overflow-auto whitespace-pre-wrap break-words rounded-md border bg-background p-3 font-mono text-xs leading-relaxed text-foreground',
          className,
        )}
      >
        {String(value)}
      </pre>
    )
  }

  return <CodeBlock code={prettyJson(value)} language="json" className={className} />
}
