import { ArrowDown01Icon, ArrowUp01Icon, CodeIcon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { useMemo, useState } from 'react'
import { CodeBlock } from '#/components/ai-elements/code-block'
import { Badge } from '#/components/ui/badge'
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from '#/components/ui/empty'
import { Toggle } from '#/components/ui/toggle'
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

interface ToolParam {
  name: string
  type: string
  description?: string
  required: boolean
  enumValues?: JsonValue[]
  defaultValue?: JsonValue
}

function paramType(value: JsonValue): string {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return 'unknown'
  const t = value.type
  if (Array.isArray(t)) return t.filter((x): x is string => typeof x === 'string').join(' | ') || 'unknown'
  if (typeof t === 'string') {
    if (t === 'array' && value.items != null) return `${paramType(value.items)}[]`
    return t
  }
  for (const k of ['anyOf', 'oneOf', 'allOf'] as const) {
    const branch = value[k]
    if (Array.isArray(branch) && branch.length > 0) return branch.map(paramType).join(k === 'allOf' ? ' & ' : ' | ')
  }
  if (typeof value.const === 'string' || typeof value.const === 'number' || typeof value.const === 'boolean') {
    return JSON.stringify(value.const)
  }
  return 'unknown'
}

function extractToolParams(raw: JsonValue): { params: ToolParam[]; schema: JsonValue | undefined } {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return { params: [], schema: undefined }
  let schema: JsonValue | undefined
  const fn = raw.function
  if (fn && typeof fn === 'object' && !Array.isArray(fn) && fn.parameters != null) schema = fn.parameters
  else schema = raw.parameters ?? raw.input_schema ?? raw.inputSchema
  if (!schema || typeof schema !== 'object' || Array.isArray(schema)) return { params: [], schema: undefined }
  const props = schema.properties
  const required = new Set<string>(
    Array.isArray(schema.required) ? schema.required.filter((x): x is string => typeof x === 'string') : [],
  )
  if (!props || typeof props !== 'object' || Array.isArray(props)) return { params: [], schema }
  const out: ToolParam[] = []
  for (const [name, val] of Object.entries(props)) {
    if (!val || typeof val !== 'object' || Array.isArray(val)) {
      out.push({ name, type: 'unknown', required: required.has(name) })
      continue
    }
    out.push({
      name,
      type: paramType(val),
      description: typeof val.description === 'string' ? val.description : undefined,
      required: required.has(name),
      enumValues: Array.isArray(val.enum) ? val.enum : undefined,
      defaultValue: val.default,
    })
  }
  out.sort((a, b) => Number(b.required) - Number(a.required) || a.name.localeCompare(b.name))
  return { params: out, schema }
}

export function ToolDetailView({ raw }: { raw: JsonValue }) {
  const [showJson, setShowJson] = useState(false)
  const { params, schema } = useMemo(() => extractToolParams(raw), [raw])
  const hasSchema = schema !== undefined
  return (
    <div className="flex min-w-0 flex-col gap-2">
      <div className="flex items-center justify-end">
        <Toggle
          size="sm"
          variant="outline"
          pressed={showJson}
          onPressedChange={setShowJson}
          aria-label="Toggle raw JSON"
          title={showJson ? 'Show summary' : 'Show raw JSON'}
        >
          <HugeiconsIcon icon={CodeIcon} strokeWidth={2} className="size-3.5" />
          <span className="font-mono">JSON</span>
        </Toggle>
      </div>
      {showJson ? (
        <CodeBlock code={formatJson(raw)} language="json" className="max-h-80" />
      ) : !hasSchema ? (
        <p className="text-xs text-muted-foreground">No schema captured.</p>
      ) : params.length === 0 ? (
        <p className="text-xs text-muted-foreground">No parameters.</p>
      ) : (
        <ParamList params={params} />
      )}
    </div>
  )
}

function ParamList({ params }: { params: ToolParam[] }) {
  return (
    <div className="flex flex-col gap-2">
      {params.map((p) => (
        <div key={p.name} className="rounded-md border bg-card px-3 py-2">
          <div className="flex items-baseline gap-2">
            <span className="break-all font-mono text-sm text-foreground">{p.name}</span>
            <span className="font-mono text-[11px] text-muted-foreground">{p.type}</span>
            {p.required && <span className="text-[10.5px] uppercase tracking-wide text-destructive">required</span>}
          </div>
          {p.description && (
            <p className="mt-1 break-words text-xs leading-snug text-muted-foreground">{p.description}</p>
          )}
          {p.enumValues && p.enumValues.length > 0 && (
            <div className="mt-1.5 flex flex-wrap items-center gap-1">
              <span className="text-[10.5px] uppercase tracking-wide text-muted-foreground/70">enum</span>
              {p.enumValues.map((v, i) => (
                <code
                  // biome-ignore lint/suspicious/noArrayIndexKey: enum values may not be unique strings
                  key={`${p.name}-enum-${i}`}
                  className="rounded bg-muted px-1 py-px font-mono text-[10.5px] text-foreground"
                >
                  {typeof v === 'string' ? v : JSON.stringify(v)}
                </code>
              ))}
            </div>
          )}
          {p.defaultValue !== undefined && (
            <div className="mt-1.5 flex flex-wrap items-baseline gap-1">
              <span className="text-[10.5px] uppercase tracking-wide text-muted-foreground/70">default</span>
              <code className="rounded bg-muted px-1 py-px font-mono text-[10.5px] text-foreground">
                {typeof p.defaultValue === 'string' ? p.defaultValue : JSON.stringify(p.defaultValue)}
              </code>
            </div>
          )}
        </div>
      ))}
    </div>
  )
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
