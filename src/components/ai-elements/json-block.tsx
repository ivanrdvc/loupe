import { Braces, Check, Copy } from 'lucide-react'
import { type ReactNode, useMemo, useState } from 'react'
import { Button } from '#/components/ui/button'
import { Toggle } from '#/components/ui/toggle'
import { parseJson, parseJsonConcat, prettyJson } from '#/lib/json'
import { cn } from '#/lib/utils'
import { CodeBlock } from './code-block'
import { JsonTree } from './json-tree'

// A labeled section with a raw↔formatted JSON toggle and a copy button in the
// header. Shared by the span inspector and the MCP tool view.
export function PanelSection({
  label,
  copyText,
  raw,
  bodyClassName,
  children,
}: {
  label: string
  copyText?: string
  raw?: ReactNode
  bodyClassName?: string
  children: ReactNode
}) {
  const [showRaw, setShowRaw] = useState(false)
  const [copied, setCopied] = useState(false)

  const copy = () => {
    if (copyText == null) return
    navigator.clipboard.writeText(copyText).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    })
  }

  return (
    <div className="min-w-0 max-w-full overflow-hidden rounded-md border">
      <div className="flex items-center gap-1 border-b bg-muted/50 py-1 pr-1 pl-2.5">
        <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{label}</span>
        <div className="ml-auto flex items-center gap-0.5">
          {raw != null && (
            <Toggle
              size="sm"
              pressed={showRaw}
              onPressedChange={setShowRaw}
              className="h-5 min-w-0 px-1.5 text-muted-foreground"
              aria-label="Show raw JSON"
            >
              <Braces aria-hidden />
            </Toggle>
          )}
          {copyText != null && (
            <Button variant="ghost" size="icon-xs" className="size-5" onClick={copy} aria-label="Copy">
              {copied ? <Check aria-hidden /> : <Copy aria-hidden />}
            </Button>
          )}
        </div>
      </div>
      <div className={cn('overflow-auto p-2.5', bodyClassName)}>{showRaw && raw != null ? raw : children}</div>
    </div>
  )
}

export function JsonBlock({ label, value, raw }: { label: string; value?: unknown; raw?: string }) {
  const resolved = useMemo(() => {
    const v = raw != null ? (parseJson(raw) ?? parseJsonConcat(raw) ?? raw) : value
    return typeof v === 'string' ? (parseJson(v) ?? parseJsonConcat(v) ?? v) : v
  }, [raw, value])
  const structured = resolved !== null && typeof resolved === 'object'

  return (
    <PanelSection
      label={label}
      copyText={raw ?? prettyJson(resolved)}
      bodyClassName="max-h-96"
      raw={
        structured ? (
          <CodeBlock code={prettyJson(resolved)} language="json" className="rounded-none border-0 bg-transparent p-0" />
        ) : undefined
      }
    >
      {structured ? (
        <JsonTree value={resolved} />
      ) : (
        <pre className="whitespace-pre-wrap break-words font-mono text-xs leading-relaxed">{String(resolved)}</pre>
      )}
    </PanelSection>
  )
}
