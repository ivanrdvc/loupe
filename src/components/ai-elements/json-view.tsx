import { looksLikeJson, parseJson } from '#/lib/json'
import { cn } from '#/lib/utils'
import { CodeBlock } from './code-block'
import { JsonTree } from './json-tree'

interface Props {
  value: unknown
  className?: string
}

const PLAIN_CLS =
  'not-prose w-full min-w-0 max-w-full overflow-auto whitespace-pre-wrap break-words rounded-md border bg-background p-3 font-mono text-xs leading-relaxed text-foreground'

export function JsonView({ value, className }: Props) {
  if (value === null || value === undefined) return null

  let resolved = value
  if (typeof value === 'string') {
    const parsed = parseJson(value)
    if (parsed !== undefined && parsed !== null && typeof parsed === 'object') {
      resolved = parsed
    } else if (looksLikeJson(value)) {
      return <CodeBlock code={value} language="json" className={className} />
    } else {
      return <pre className={cn(PLAIN_CLS, className)}>{value}</pre>
    }
  }

  if (typeof resolved !== 'object') {
    return <pre className={cn(PLAIN_CLS, className)}>{String(resolved)}</pre>
  }

  return (
    <div
      className={cn(
        'not-prose w-full min-w-0 max-w-full overflow-auto rounded-md border bg-background p-2.5',
        className,
      )}
    >
      <JsonTree value={resolved} />
    </div>
  )
}
