import { lazy, Suspense } from 'react'
import { cn } from '#/lib/utils'

const Inner = lazy(() => import('./code-block').then((m) => ({ default: m.CodeBlock })))

interface Props {
  code: string
  language: 'json'
  className?: string
  showLineNumbers?: boolean
}

export function CodeBlock(props: Props) {
  return (
    <Suspense fallback={<CodeBlockFallback {...props} />}>
      <Inner {...props} />
    </Suspense>
  )
}

function CodeBlockFallback({ code, className }: Props) {
  return (
    <pre
      className={cn(
        'not-prose w-full min-w-0 max-w-full overflow-auto rounded-md border bg-background p-3 font-mono text-xs leading-relaxed text-foreground',
        className,
      )}
    >
      {code}
    </pre>
  )
}
