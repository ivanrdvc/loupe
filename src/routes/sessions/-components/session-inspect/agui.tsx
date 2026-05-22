import { Fragment, useMemo } from 'react'
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '#/components/ui/accordion'
import { Badge } from '#/components/ui/badge'
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from '#/components/ui/empty'
import { formatJson } from '#/lib/json'
import type { Span } from '#/lib/spans'
import {
  collectAguiItems,
  collectFrontendTools,
  collectSystemHits,
  type FrontendTool,
  isShortValue,
} from './context-collectors'

const AG_UI_PREFIXES = ['ag_ui_', 'ag_ui.'] as const
const AG_UI_SKIP = new Set(['ag_ui_thread_id', 'ag_ui.thread_id', 'ag_ui_run_id', 'ag_ui.run_id'])

interface AgUiAttr {
  key: string
  label: string
  value: string
  parsed: unknown | undefined
}

function extractAgUiAttrs(span: Span): AgUiAttr[] {
  if (!span.rawAttributes) return []
  const out: AgUiAttr[] = []
  for (const [k, v] of Object.entries(span.rawAttributes)) {
    if (AG_UI_SKIP.has(k)) continue
    if (!AG_UI_PREFIXES.some((p) => k.startsWith(p))) continue
    const raw = typeof v === 'string' ? v : JSON.stringify(v)
    const label = k.replace(/^ag_ui[._]/, '')
    let parsed: unknown | undefined
    const trimmed = raw.trim()
    if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
      try {
        parsed = JSON.parse(raw)
      } catch {
        /* plain text */
      }
    }
    out.push({ key: k, label, value: raw, parsed })
  }
  return out
}

export function AgUiSpanSection({ span }: { span: Span }) {
  const attrs = useMemo(() => extractAgUiAttrs(span), [span])
  if (attrs.length === 0) return null

  const identifiers: AgUiAttr[] = []
  const payloads: AgUiAttr[] = []
  for (const attr of attrs) {
    if (attr.parsed !== undefined || attr.value.length > 120) payloads.push(attr)
    else identifiers.push(attr)
  }

  return (
    <details open className="rounded-lg ring-1 ring-border">
      <summary className="cursor-pointer px-3 py-2 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
        AG-UI Context
      </summary>
      <div className="space-y-2 border-border border-t px-3 py-2">
        {span.agUiRunId && (
          <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-1 text-[11px]">
            <dt className="text-muted-foreground">Run ID</dt>
            <dd className="min-w-0 truncate font-mono text-foreground" title={span.agUiRunId}>
              {span.agUiRunId}
            </dd>
          </dl>
        )}
        {identifiers.length > 0 && (
          <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-1 text-[11px]">
            {identifiers.map((attr) => (
              <Fragment key={attr.key}>
                <dt className="text-muted-foreground">{attr.label}</dt>
                <dd className="min-w-0 truncate text-foreground" title={attr.value}>
                  {attr.value}
                </dd>
              </Fragment>
            ))}
          </dl>
        )}
        {payloads.map((attr) => (
          <div key={attr.key}>
            <div className="mb-1 text-[11px] text-muted-foreground">{attr.label}</div>
            <pre className="max-h-60 overflow-auto whitespace-pre-wrap break-words rounded-md bg-muted p-2 text-xs leading-snug text-foreground ring-1 ring-border">
              {attr.parsed !== undefined ? formatJson(attr.parsed) : attr.value}
            </pre>
          </div>
        ))}
      </div>
    </details>
  )
}

export function AgUiSessionPanel({ spans }: { spans: Span[] }) {
  const systemHits = useMemo(() => collectSystemHits(spans), [spans])
  const aguiItems = useMemo(() => collectAguiItems(spans, systemHits.agui), [spans, systemHits.agui])
  const frontendTools = useMemo(() => collectFrontendTools(spans), [spans])

  if (aguiItems.length === 0 && frontendTools.length === 0) {
    return (
      <Empty className="border-0">
        <EmptyHeader>
          <EmptyTitle>No AG-UI context</EmptyTitle>
          <EmptyDescription>Didn't detect runtime/state context in this session.</EmptyDescription>
        </EmptyHeader>
      </Empty>
    )
  }

  const identifiers = aguiItems.filter((item) => isShortValue(item.value))
  const payloads = aguiItems.filter((item) => !isShortValue(item.value))

  return (
    <div className="space-y-4">
      {frontendTools.length > 0 && <FrontendToolsSection tools={frontendTools} />}

      {identifiers.length > 0 && (
        <dl className="overflow-hidden rounded-lg ring-1 ring-border">
          {identifiers.map((item, i) => (
            <div
              key={item.id}
              className={[
                'grid grid-cols-[max-content_minmax(0,1fr)] items-center gap-4 px-3 py-1.5 text-xs',
                i > 0 ? 'border-border border-t' : '',
              ].join(' ')}
            >
              <dt className="text-muted-foreground">{item.label}</dt>
              <dd className="truncate font-mono text-foreground" title={item.value}>
                {item.value}
              </dd>
            </div>
          ))}
        </dl>
      )}

      {payloads.length > 0 && (
        <Accordion type="multiple">
          {payloads.map((item) => (
            <AccordionItem key={item.id} value={item.id}>
              <AccordionTrigger>
                <span className="min-w-0 flex-1 truncate">{item.label}</span>
                <Badge variant="secondary" className="tabular-nums">
                  {item.tokens.toLocaleString()} tok
                </Badge>
              </AccordionTrigger>
              <AccordionContent>
                <pre className="max-h-80 overflow-auto whitespace-pre-wrap break-words text-xs leading-snug text-foreground">
                  {item.value}
                </pre>
              </AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
      )}
    </div>
  )
}

function FrontendToolsSection({ tools }: { tools: FrontendTool[] }) {
  return (
    <section>
      <header className="mb-2 flex items-baseline justify-between gap-2 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
        <span>Frontend tools</span>
        <span className="tabular-nums">{tools.length}</span>
      </header>
      <div className="divide-y divide-border overflow-hidden rounded-lg ring-1 ring-border">
        {tools.map((tool) => (
          <details key={tool.id} className="group">
            <summary className="grid cursor-pointer grid-cols-[minmax(0,1fr)_auto] gap-3 px-3 py-2 text-xs">
              <span className="min-w-0">
                <span className="block truncate font-medium text-foreground">{tool.name}</span>
                {tool.description && (
                  <span className="mt-0.5 block truncate text-muted-foreground">{tool.description}</span>
                )}
              </span>
              <span className="tabular-nums text-muted-foreground">
                {tool.tokens ? `${tool.tokens.toLocaleString()} tok` : '—'}
              </span>
            </summary>
            {tool.raw != null && (
              <pre className="max-h-80 overflow-auto whitespace-pre-wrap break-words bg-card/70 px-3 py-2 text-xs leading-snug text-foreground">
                {formatJson(tool.raw)}
              </pre>
            )}
          </details>
        ))}
      </div>
    </section>
  )
}
