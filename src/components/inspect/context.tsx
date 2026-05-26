import { ArrowDown01Icon, ArrowUp01Icon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { useState } from 'react'
import { CodeBlock } from '#/components/ai-elements/code-block'
import { Badge } from '#/components/ui/badge'
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from '#/components/ui/empty'
import { formatTokens } from '#/lib/format'
import type { ToolDef, ToolGroup } from '#/lib/inspector-view'
import { formatJson, type JsonValue } from '#/lib/json'

export function ContextTools({ groups }: { groups: ToolGroup[] }) {
  if (groups.length === 0) {
    return (
      <Empty className="border-0">
        <EmptyHeader>
          <EmptyTitle>No tool definitions</EmptyTitle>
          <EmptyDescription>The chat spans didn't advertise any tools.</EmptyDescription>
        </EmptyHeader>
      </Empty>
    )
  }
  const wrapped = groups.filter((g) => g.kind !== 'default')
  const flat = groups.find((g) => g.kind === 'default')?.tools ?? []
  return (
    <div className="flex min-w-0 flex-col gap-4">
      {wrapped.map((group) => (
        <GroupSection key={`${group.kind}:${group.domain}`} group={group} />
      ))}
      {flat.length > 0 && (
        <div className="overflow-hidden rounded-md border">
          {flat.map((tool) => (
            <ToolRow key={tool.id} tool={tool} />
          ))}
        </div>
      )}
    </div>
  )
}

function GroupSection({ group }: { group: ToolGroup }) {
  return (
    <section className="flex min-w-0 flex-col gap-2">
      <header className="flex items-baseline justify-between gap-2 px-1 text-[11px] text-muted-foreground">
        <span className="truncate">{group.domain}</span>
        <span className="tabular-nums font-mono">
          {group.tools.length} · {formatTokens(group.tokens)} tok
        </span>
      </header>
      <div className="overflow-hidden rounded-md border">
        {group.tools.map((tool) => (
          <ToolRow key={tool.id} tool={tool} />
        ))}
      </div>
    </section>
  )
}

function ToolRow({ tool }: { tool: ToolDef }) {
  return (
    <ExpandableRow
      title={tool.name}
      subtitle={tool.description}
      tokens={tool.tokens}
      content={() => <ToolDetailView raw={tool.raw} />}
    />
  )
}

export function ToolDetailView({ raw }: { raw: JsonValue }) {
  return <CodeBlock code={formatJson(raw)} language="json" className="max-h-80" />
}

export function ExpandableRow({
  title,
  subtitle,
  tokens,
  content,
}: {
  title: string
  subtitle?: string
  tokens?: number
  // Render-prop so heavy work (formatJson, Shiki) only runs when expanded.
  content: () => React.ReactNode
}) {
  const [open, setOpen] = useState(false)
  return (
    <div className="border-b border-border bg-card text-card-foreground last:border-b-0">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="flex w-full items-center gap-2 px-3 py-2 text-left transition-colors hover:bg-muted/50"
      >
        <div className="min-w-0 flex-1">
          <div className="break-words font-mono text-foreground text-sm">{title}</div>
          {subtitle && <div className="mt-0.5 break-words text-xs text-muted-foreground">{subtitle}</div>}
        </div>
        {tokens != null && (
          <Badge variant="outline" className="tabular-nums">
            {formatTokens(tokens)} tok
          </Badge>
        )}
        <HugeiconsIcon
          icon={open ? ArrowUp01Icon : ArrowDown01Icon}
          strokeWidth={2}
          className="size-4 shrink-0 text-muted-foreground"
        />
      </button>
      {open && <div className="border-border border-t bg-background px-3 py-2">{content()}</div>}
    </div>
  )
}
