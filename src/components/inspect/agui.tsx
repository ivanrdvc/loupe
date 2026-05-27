import { useMemo } from 'react'
import { JsonView } from '#/components/ai-elements/json-view'
import { Card, CardContent } from '#/components/ui/card'
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from '#/components/ui/empty'
import { Table, TableBody, TableCell, TableRow } from '#/components/ui/table'
import { type FrontendTool, type InspectorView, isShortValue } from '#/lib/inspector-view'
import { type JsonValue, parseJson } from '#/lib/json'
import type { Span } from '#/lib/spans'
import { ExpandableRow, ToolDetailView } from './context'

const AG_UI_PREFIXES = ['ag_ui_', 'ag_ui.'] as const
const AG_UI_SKIP = new Set(['ag_ui_thread_id', 'ag_ui.thread_id', 'ag_ui_run_id', 'ag_ui.run_id'])

interface AgUiAttr {
  key: string
  label: string
  value: string
  parsed: JsonValue | undefined
}

function extractAgUiAttrs(span: Span): AgUiAttr[] {
  if (!span.rawAttributes) return []
  const out: AgUiAttr[] = []
  for (const [k, v] of Object.entries(span.rawAttributes)) {
    if (AG_UI_SKIP.has(k)) continue
    if (!AG_UI_PREFIXES.some((p) => k.startsWith(p))) continue
    const raw = typeof v === 'string' ? v : JSON.stringify(v)
    const label = k.replace(/^ag_ui[._]/, '')
    out.push({ key: k, label, value: raw, parsed: parseJson(raw) })
  }
  return out
}

interface IdRow {
  label: string
  value: string
}

interface PayloadBlock {
  id: string
  label: string
  parsed: JsonValue | undefined
  raw: string
  tokens?: number
}

export function AgUiPanel({ span, view }: { span?: Span; view: InspectorView }) {
  const spanAttrs = useMemo(() => (span ? extractAgUiAttrs(span) : []), [span])
  const sessionItems = view.aguiItems
  const frontendTools = view.frontendTools

  const runIds = useMemo(() => {
    const ids = new Set<string>()
    for (const s of view.spans) if (s.agUiRunId) ids.add(s.agUiRunId)
    return [...ids]
  }, [view.spans])

  const idRows: IdRow[] = []
  for (const id of runIds) idRows.push({ label: 'Run ID', value: id })
  for (const item of sessionItems) {
    if (isShortValue(item.value)) idRows.push({ label: item.label, value: item.value })
  }
  for (const attr of spanAttrs) {
    if (attr.parsed === undefined && attr.value.length <= 120) {
      idRows.push({ label: attr.label, value: attr.value })
    }
  }

  const payloads: PayloadBlock[] = []
  for (const attr of spanAttrs) {
    if (attr.parsed !== undefined || attr.value.length > 120) {
      payloads.push({
        id: `span-${attr.key}`,
        label: attr.label,
        parsed: attr.parsed,
        raw: attr.value,
      })
    }
  }
  for (const item of sessionItems) {
    if (isShortValue(item.value)) continue
    payloads.push({
      id: item.id,
      label: item.label,
      parsed: parseJson(item.value),
      raw: item.value,
      tokens: item.tokens,
    })
  }

  if (idRows.length === 0 && payloads.length === 0 && frontendTools.length === 0) {
    return (
      <Empty className="border-0">
        <EmptyHeader>
          <EmptyTitle>No AG-UI context</EmptyTitle>
          <EmptyDescription>Didn't detect runtime/state context in this session.</EmptyDescription>
        </EmptyHeader>
      </Empty>
    )
  }

  return (
    <Card size="sm">
      <CardContent className="flex min-w-0 flex-col gap-4">
        {idRows.length > 0 && (
          <Table>
            <TableBody>
              {idRows.map((row) => (
                <TableRow key={`${row.label}-${row.value}`}>
                  <TableCell className="py-1.5 pr-4 font-mono text-xs text-muted-foreground">{row.label}</TableCell>
                  <TableCell className="w-full max-w-0 py-1.5 font-mono text-xs text-foreground">
                    <span className="block truncate" title={row.value}>
                      {row.value}
                    </span>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}

        {frontendTools.length > 0 && <FrontendToolsSection tools={frontendTools} />}

        {payloads.length > 0 && (
          <section className="flex min-w-0 flex-col gap-2">
            <header className="px-1 font-mono text-[11px] text-muted-foreground">Payloads · {payloads.length}</header>
            <div className="overflow-hidden rounded-md border">
              {payloads.map((p) => (
                <ExpandableRow
                  key={p.id}
                  title={p.label}
                  tokens={p.tokens}
                  content={() => <JsonView value={p.parsed ?? p.raw} className="max-h-80" />}
                />
              ))}
            </div>
          </section>
        )}
      </CardContent>
    </Card>
  )
}

function FrontendToolsSection({ tools }: { tools: FrontendTool[] }) {
  return (
    <section className="flex min-w-0 flex-col gap-2">
      <header className="flex items-baseline justify-between gap-2 px-1 font-mono text-[11px] text-muted-foreground">
        <span>Frontend tools</span>
        <span className="tabular-nums">{tools.length}</span>
      </header>
      <div className="overflow-hidden rounded-md border">
        {tools.map((tool) => (
          <ExpandableRow
            key={tool.id}
            title={tool.name}
            subtitle={tool.description}
            tokens={tool.tokens || undefined}
            content={() =>
              tool.raw != null ? (
                <ToolDetailView raw={tool.raw} />
              ) : (
                <div className="text-xs text-muted-foreground">No schema captured.</div>
              )
            }
          />
        ))}
      </div>
    </section>
  )
}
