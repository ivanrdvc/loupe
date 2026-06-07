import { ArrowDown01Icon, ArrowUp01Icon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { JsonView } from '#/components/ai-elements/json-view'
import { Badge } from '#/components/ui/badge'
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from '#/components/ui/empty'
import type { ToolDef, ToolGroup } from '#/features/inspect/logic'
import { formatPercent, formatTokens } from '#/lib/format'
import type { JsonValue } from '#/lib/json'
import { toolsCatalogQuery } from './tool-data'

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
      badge={<ToolHealthBadge name={tool.name} />}
      content={() => <ToolDetailView raw={tool.raw} />}
    />
  )
}

// Silent unless the tool's error rate over the past 7 days is notable.
const HEALTH_WARN_RATE = 0.05

function ToolHealthBadge({ name }: { name: string }) {
  const { data } = useQuery({
    ...toolsCatalogQuery(),
    select: (rows) => rows.find((r) => r.name === name),
  })
  if (!data || data.errors === 0 || data.errorRate < HEALTH_WARN_RATE) return null
  return (
    <Badge
      variant="destructive"
      className="shrink-0 px-1 text-[10px] tabular-nums"
      title="Error rate over the past 7 days"
    >
      {formatPercent(data.errorRate, 1)} err
    </Badge>
  )
}

export function ToolDetailView({ raw }: { raw: JsonValue }) {
  return <JsonView value={raw} className="max-h-80" />
}

export function ExpandableRow({
  title,
  subtitle,
  tokens,
  badge,
  content,
}: {
  title: string
  subtitle?: string
  tokens?: number
  badge?: React.ReactNode
  // Render-prop so heavy work (stringify, syntax tokenization) only runs when expanded.
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
        {badge}
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
