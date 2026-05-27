import { ChevronDownIcon, ChevronRightIcon } from '@heroicons/react/16/solid'
import {
  ArrowPathRoundedSquareIcon,
  CheckIcon,
  ClipboardIcon,
  CommandLineIcon,
  CubeTransparentIcon,
  ExclamationTriangleIcon,
  InformationCircleIcon,
  MagnifyingGlassIcon,
  TableCellsIcon,
  WrenchScrewdriverIcon,
} from '@heroicons/react/24/outline'
import { useMemo, useState } from 'react'
import { JsonView } from '#/components/ai-elements/json-view'
import { formatTokens } from '#/components/context-window'
import { IconTabs } from '#/components/icon-tabs'
import { Spinner } from '#/components/spinner'
import { Badge } from '#/components/ui/badge'
import { Button } from '#/components/ui/button'
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from '#/components/ui/empty'
import { InputGroup, InputGroupAddon, InputGroupInput } from '#/components/ui/input-group'
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from '#/components/ui/resizable'
import { ScrollArea } from '#/components/ui/scroll-area'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '#/components/ui/table'
import { useBreakdowns } from '#/hooks/use-breakdowns'
import { useCopyToClipboard } from '#/hooks/use-copy-to-clipboard'
import { useIsMobile } from '#/hooks/use-mobile'
import { formatCost } from '#/lib/format'
import { type InspectorView, spanHasError, type Turn, turnTotals } from '#/lib/inspector-view'
import { formatJson } from '#/lib/json'
import type { Span } from '#/lib/spans'
import { cn } from '#/lib/utils'
import { AgUiPanel } from './agui'
import { ContextTools } from './context'
import { computeContextSegments, SEGMENT_COLORS } from './context-segments'
import { DetailPanel } from './detail-panel'
import { SessionLogsPanel } from './logs'
import { displayFor, formatDuration } from './shared'
import { SpanTreeList } from './tree'

type InspectorTab = 'details' | 'tools' | 'agui' | 'turns' | 'logs' | 'attributes'

const INSPECTOR_TABS = [
  { id: 'details', label: 'Details', Icon: InformationCircleIcon },
  { id: 'tools', label: 'Tools', Icon: WrenchScrewdriverIcon },
  { id: 'agui', label: 'AG-UI', Icon: CubeTransparentIcon },
  { id: 'turns', label: 'Turns', Icon: ArrowPathRoundedSquareIcon },
  { id: 'logs', label: 'Logs', Icon: CommandLineIcon },
  { id: 'attributes', label: 'Attributes', Icon: TableCellsIcon },
] as const

export function InspectLayout({
  view,
  loading,
  selectedId,
  onSelect,
  rawRoots,
  onToggleRawRoot,
  onEnsureRawRoot,
}: {
  view: InspectorView
  loading?: boolean
  selectedId: string | null
  onSelect: (id: string) => void
  rawRoots: Set<string>
  onToggleRawRoot: (id: string) => void
  onEnsureRawRoot: (id: string) => void
}) {
  const [inspectorTab, setInspectorTab] = useState<InspectorTab>('details')
  const isMobile = useIsMobile()
  const selectedSpan = selectedId ? view.byId.get(selectedId) : undefined

  return (
    <ResizablePanelGroup
      orientation={isMobile ? 'vertical' : 'horizontal'}
      className="flex h-full min-h-0 min-w-0 flex-1"
    >
      <ResizablePanel id="tree" defaultSize="33%" minSize="20%" maxSize="60%">
        <section className="h-full overflow-hidden">
          <ScrollArea className="h-full">
            {loading && view.spans.length === 0 ? (
              <div className="flex h-full items-center justify-center py-12 text-xs text-muted-foreground/70">
                <Spinner />
              </div>
            ) : (
              <SpanTreeList
                view={view}
                selectedId={selectedId}
                onSelect={onSelect}
                rawRoots={rawRoots}
                onToggleRawRoot={onToggleRawRoot}
                onEnsureRawRoot={onEnsureRawRoot}
              />
            )}
          </ScrollArea>
        </section>
      </ResizablePanel>
      <ResizableHandle />
      <ResizablePanel id="inspector" defaultSize="67%" minSize="40%">
        <section className="flex h-full min-h-0 min-w-0 flex-col">
          {loading && view.spans.length === 0 ? (
            <div className="flex flex-1 items-center justify-center text-xs text-muted-foreground/70">
              <Spinner />
            </div>
          ) : (
            <>
              <SessionStrip view={view} />
              <div className="flex shrink-0 items-center border-border border-b bg-muted/30 px-3 py-2.5">
                <IconTabs
                  tabs={INSPECTOR_TABS}
                  value={inspectorTab}
                  onChange={setInspectorTab}
                  aria-label="Session inspector panel"
                />
              </div>
              <ScrollArea className="min-h-0 min-w-0 flex-1">
                {inspectorTab === 'details' ? (
                  selectedSpan ? (
                    <DetailPanel span={selectedSpan} view={view} onSelect={onSelect} />
                  ) : (
                    <div className="flex min-h-[8rem] items-center justify-center px-4 text-center text-xs text-muted-foreground/70">
                      Select a span in the tree for details
                    </div>
                  )
                ) : inspectorTab === 'tools' ? (
                  <SessionTools view={view} selectedSpan={selectedSpan} />
                ) : inspectorTab === 'agui' ? (
                  <div className="px-4 py-4">
                    <AgUiPanel span={selectedSpan} view={view} />
                  </div>
                ) : inspectorTab === 'turns' ? (
                  <SessionTurnsPanel view={view} selectedId={selectedId} onSelect={onSelect} />
                ) : inspectorTab === 'attributes' ? (
                  <SpanAttributesPanel selectedSpan={selectedSpan} />
                ) : (
                  <SessionLogsPanel spans={view.spans} enabled={inspectorTab === 'logs'} />
                )}
              </ScrollArea>
            </>
          )}
        </section>
      </ResizablePanel>
    </ResizablePanelGroup>
  )
}

function SessionTools({ view, selectedSpan }: { view: InspectorView; selectedSpan: Span | undefined }) {
  // Scope rules: invoke_agent → that agent + descendants (all turns).
  // chat → just that chat span (per-turn registry; surfaces dynamic
  // mid-turn tool loading like load_tools(domain)). Otherwise → full session.
  const groups = useMemo(() => view.toolGroupsFor(selectedSpan), [view, selectedSpan])

  let count = 0
  let tokens = 0
  for (const group of groups) {
    count += group.tools.length
    tokens += group.tokens
  }

  const scopeLabel =
    selectedSpan?.operation === 'invoke_agent'
      ? (view.agentLabels.get(selectedSpan.id) ?? displayFor(selectedSpan, view.agentLabels).name)
      : selectedSpan?.operation === 'chat'
        ? `Turn · ${displayFor(selectedSpan, view.agentLabels).name}`
        : 'All agents'

  return (
    <div className="px-4 py-4">
      <header className="mb-3 flex items-baseline justify-between gap-2 text-sm">
        <span className="truncate font-medium text-foreground">{scopeLabel}</span>
        <span className="shrink-0 tabular-nums text-muted-foreground">
          {count} tool{count === 1 ? '' : 's'} · {tokens ? `${formatTokens(tokens)} tokens` : '—'}
        </span>
      </header>
      <ContextTools groups={groups} />
    </div>
  )
}

function SessionStrip({ view }: { view: InspectorView }) {
  const { ready, total } = useBreakdowns(view.orchestratorChats)
  const orchestrator = view.orchestratorIds[0] ? view.byId.get(view.orchestratorIds[0]) : undefined
  const agent = orchestrator
    ? (view.agentLabels.get(orchestrator.id) ?? orchestrator.agentName ?? orchestrator.name)
    : 'Session'

  // Grand total = orchestrator + all subagent chats. view.totals already includes both
  // via turnTotals(). Do NOT use total.inputTokens from useBreakdowns here — that only
  // covers orchestratorChats and would make the header inconsistent with the context bar
  // (whose denominator includes subagentChatTokens).
  const inputTokens = view.totals.input
  const outputTokens = view.totals.output
  const cachedTokens = view.totals.cached || total.cachedTokens
  const allTokens = inputTokens + outputTokens
  const cachePct = inputTokens > 0 ? Math.round((cachedTokens / inputTokens) * 100) : 0

  if (view.orchestratorIds.length === 0) return null

  return (
    <section className="shrink-0 border-border border-b px-4 py-3">
      <div className="flex min-w-0 flex-wrap items-baseline gap-x-3 gap-y-1 text-xs tabular-nums">
        <span className="truncate font-medium text-foreground">{agent}</span>
        <span className="text-muted-foreground/60">·</span>
        <span className="text-muted-foreground">
          {view.turns.length} turn{view.turns.length === 1 ? '' : 's'}
        </span>
        <span className="text-muted-foreground/60">·</span>
        <span className="text-muted-foreground">{formatDuration(view.totals.durationMs)}</span>
        <span className="text-muted-foreground/60">·</span>
        <span className="text-foreground">
          <span className="font-semibold">{allTokens ? formatTokens(allTokens) : '—'}</span>{' '}
          <span className="text-muted-foreground">tok</span>
          {allTokens > 0 && (
            <span className="text-muted-foreground">
              {' '}
              ({formatTokens(inputTokens)} in · {formatTokens(outputTokens)} out)
            </span>
          )}
        </span>
        {cachedTokens > 0 && (
          <>
            <span className="text-muted-foreground/60">·</span>
            <span className="text-success">
              {formatTokens(cachedTokens)} cached ({cachePct}%)
            </span>
          </>
        )}
        <span className="text-muted-foreground/60">·</span>
        <span className="text-foreground font-semibold">{formatCost(view.totals.cost)}</span>
        <span className="text-muted-foreground/60">·</span>
        <span className={view.totals.errors > 0 ? 'text-destructive' : 'text-muted-foreground'}>
          {view.totals.errors > 0 ? `${view.totals.errors} err` : '0 err'}
        </span>
        {!ready && <span className="text-[11px] text-muted-foreground">counting…</span>}
      </div>
      <div className="mt-3">
        <ContextBreakdown
          systemTokens={total.systemTokens}
          toolDefsTokens={total.toolDefsTokens}
          messagesTokens={total.messagesTokens}
          subagentTokens={view.subagentChatTokens}
        />
      </div>
    </section>
  )
}

function SpanAttributesPanel({ selectedSpan }: { selectedSpan: Span | undefined }) {
  const [query, setQuery] = useState('')

  const entries = selectedSpan?.rawAttributes
    ? Object.entries(selectedSpan.rawAttributes)
        .filter(([, v]) => v != null && v !== '')
        .sort(([a], [b]) => a.localeCompare(b))
    : []

  const q = query.trim().toLowerCase()
  const filtered = q
    ? entries.filter(([k, v]) => k.toLowerCase().includes(q) || formatAttrValue(v).toLowerCase().includes(q))
    : entries

  if (!selectedSpan) {
    return (
      <Empty className="border-0">
        <EmptyHeader>
          <EmptyTitle>No span selected</EmptyTitle>
          <EmptyDescription>Pick a span in the tree to inspect its raw attributes.</EmptyDescription>
        </EmptyHeader>
      </Empty>
    )
  }
  if (entries.length === 0) {
    return (
      <Empty className="border-0">
        <EmptyHeader>
          <EmptyTitle>No attributes</EmptyTitle>
          <EmptyDescription>The provider didn't return raw fields for this span.</EmptyDescription>
        </EmptyHeader>
      </Empty>
    )
  }

  return (
    <div className="flex flex-col gap-3 px-4 py-3">
      <div className="flex items-center gap-2">
        <InputGroup className="flex-1">
          <InputGroupAddon>
            <MagnifyingGlassIcon />
          </InputGroupAddon>
          <InputGroupInput value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Filter attributes…" />
        </InputGroup>
        <Badge variant="secondary" className="shrink-0 tabular-nums">
          {filtered.length === entries.length ? entries.length : `${filtered.length} / ${entries.length}`}
        </Badge>
      </div>
      {filtered.length === 0 ? (
        <Empty className="border-0">
          <EmptyHeader>
            <EmptyTitle>No matches</EmptyTitle>
            <EmptyDescription>No fields match “{query}”.</EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <div className="overflow-hidden rounded-md border">
          <Table className="table-fixed">
            <TableHeader>
              <TableRow>
                <TableHead className="w-[14rem] font-mono text-[11px] uppercase tracking-wide">Key</TableHead>
                <TableHead className="font-mono text-[11px] uppercase tracking-wide">Value</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map(([k, v]) => (
                <AttrRow key={k} attrKey={k} value={v} />
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  )
}

const ATTR_PREVIEW_LIMIT = 140

function AttrRow({ attrKey, value }: { attrKey: string; value: unknown }) {
  const formatted = formatAttrValue(value)
  const isLong = formatted.length > ATTR_PREVIEW_LIMIT || formatted.includes('\n')
  const [expanded, setExpanded] = useState(false)
  const { copied, failed, copy } = useCopyToClipboard()
  const onCopy = () => copy(formatted)

  return (
    <TableRow className="group align-top">
      <TableCell className="max-w-[14rem] truncate py-1.5 font-mono text-xs text-muted-foreground" title={attrKey}>
        {attrKey}
      </TableCell>
      <TableCell className="whitespace-normal py-1.5 font-mono text-xs text-foreground">
        <div className="flex min-w-0 items-start gap-1.5">
          <div className="min-w-0 flex-1">
            {isLong ? (
              expanded ? (
                <JsonView value={value} className="max-h-64" />
              ) : (
                <span className="block truncate text-muted-foreground/90" title={formatted.slice(0, 400)}>
                  {formatted.slice(0, ATTR_PREVIEW_LIMIT)}…
                </span>
              )
            ) : (
              <span className="block break-all">{formatted}</span>
            )}
            {isLong && (
              <Button
                variant="ghost"
                size="sm"
                className="mt-1 text-muted-foreground hover:text-foreground"
                onClick={() => setExpanded((x) => !x)}
              >
                {expanded ? <ChevronDownIcon /> : <ChevronRightIcon />}
                {expanded ? 'Collapse' : `Show (${formatted.length.toLocaleString()} chars)`}
              </Button>
            )}
          </div>
          <Button
            variant="ghost"
            size="icon-sm"
            className={cn(
              'shrink-0 transition-opacity focus-visible:opacity-100',
              copied || failed ? 'opacity-100' : 'opacity-0 group-hover:opacity-100',
              failed && 'text-destructive',
            )}
            aria-label={copied ? 'Copied' : failed ? 'Copy failed' : `Copy ${attrKey}`}
            title={copied ? 'Copied' : failed ? 'Copy failed — clipboard unavailable' : 'Copy value'}
            onClick={onCopy}
          >
            {copied ? <CheckIcon /> : failed ? <ExclamationTriangleIcon /> : <ClipboardIcon />}
          </Button>
        </div>
      </TableCell>
    </TableRow>
  )
}

function formatAttrValue(v: unknown): string {
  if (v == null) return ''
  return formatJson(v)
}

function SessionTurnsPanel({
  view,
  selectedId,
  onSelect,
}: {
  view: InspectorView
  selectedId: string | null
  onSelect: (id: string) => void
}) {
  const turns = view.turns
  const errorCount = view.totals.errors

  if (turns.length === 0) {
    return (
      <Empty className="border-0">
        <EmptyHeader>
          <EmptyTitle>No turns</EmptyTitle>
          <EmptyDescription>This session didn't surface any orchestrator turns.</EmptyDescription>
        </EmptyHeader>
      </Empty>
    )
  }

  return (
    <div className="flex flex-col gap-3 px-4 py-3">
      {errorCount > 0 && (
        <div className="flex items-center gap-2">
          <Badge variant="destructive" className="tabular-nums">
            {errorCount} error{errorCount === 1 ? '' : 's'}
          </Badge>
        </div>
      )}
      <div className="overflow-hidden rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[3rem] text-[11px] uppercase tracking-wide">Turn</TableHead>
              <TableHead className="text-[11px] uppercase tracking-wide">Model</TableHead>
              <TableHead
                className="w-[5.5rem] text-right text-[11px] uppercase tracking-wide"
                title="Context window size at turn start (first chat's input_tokens)"
              >
                Ctx in
              </TableHead>
              <TableHead
                className="w-[5.5rem] text-right text-[11px] uppercase tracking-wide"
                title="Growth in context size since previous turn's start. Captures assistant reply + tool outputs + any new user message."
              >
                Δ
              </TableHead>
              <TableHead className="w-[5rem] text-right text-[11px] uppercase tracking-wide">Calls</TableHead>
              <TableHead className="w-[6rem] text-right text-[11px] uppercase tracking-wide">Cost</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {turns.map((turn, index) => {
              const prev = index > 0 ? turns[index - 1] : undefined
              return (
                <SessionTurnRow
                  key={turn.run.id}
                  turn={turn}
                  prevTurn={prev}
                  index={index + 1}
                  agentLabels={view.agentLabels}
                  selected={turn.run.id === selectedId}
                  onSelect={onSelect}
                />
              )
            })}
          </TableBody>
        </Table>
      </div>
    </div>
  )
}

function ContextBreakdown({
  systemTokens,
  toolDefsTokens,
  messagesTokens,
  subagentTokens,
}: {
  systemTokens: number
  toolDefsTokens: number
  messagesTokens: number
  subagentTokens: number
}) {
  const [hovered, setHovered] = useState<string | null>(null)
  const segments = computeContextSegments({
    systemTokens,
    toolDefsTokens,
    messagesTokens,
    subagentTokens,
  })
  const denom = segments.reduce((acc, s) => acc + s.tokens, 0) || 1

  return (
    <div className="mt-2">
      <div className="flex h-1.5 w-full overflow-hidden rounded-full bg-muted">
        {segments.map((s) =>
          s.tokens > 0 ? (
            <div
              key={s.key}
              className={`${SEGMENT_COLORS[s.key]} transition-opacity duration-75`}
              style={{
                width: `${(s.tokens / denom) * 100}%`,
                opacity: hovered === null || hovered === s.key ? 1 : 0.3,
              }}
            />
          ) : null,
        )}
      </div>
      <ul className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
        {segments.map((s) => (
          <li
            key={s.key}
            onMouseEnter={() => setHovered(s.key)}
            onMouseLeave={() => setHovered(null)}
            className={`inline-flex cursor-default items-center gap-1.5 tabular-nums transition-opacity duration-75 ${
              hovered !== null && hovered !== s.key ? 'opacity-40' : 'opacity-100'
            }`}
          >
            <span className={`size-1.5 rounded-full ${SEGMENT_COLORS[s.key]}`} />
            <span className="text-muted-foreground">{s.label}</span>
            <span className="text-foreground">{s.tokens ? formatTokens(s.tokens) : '—'}</span>
            {s.tokens > 0 && <span className="text-muted-foreground">· {s.pct}%</span>}
          </li>
        ))}
      </ul>
    </div>
  )
}

function SessionTurnRow({
  turn,
  prevTurn,
  index,
  agentLabels,
  selected,
  onSelect,
}: {
  turn: Turn
  prevTurn: Turn | undefined
  index: number
  agentLabels?: Map<string, string>
  selected: boolean
  onSelect: (id: string) => void
}) {
  const { run, chats, subagentChats, actions } = turn
  const errors = actions.filter(spanHasError).length
  const totals = turnTotals(turn)
  const modelLabel = totals.model ?? agentLabels?.get(run.id) ?? run.agentName ?? run.name
  const ctxIn = chats[0]?.inputTokens
  const prevCtxIn = prevTurn?.chats[0]?.inputTokens
  const delta = ctxIn != null && prevCtxIn != null ? ctxIn - prevCtxIn : undefined
  const subTok = subagentChats.reduce((acc, c) => acc + (c.inputTokens ?? 0) + (c.outputTokens ?? 0), 0)

  return (
    <TableRow
      data-state={selected ? 'selected' : undefined}
      onClick={() => onSelect(run.id)}
      className="cursor-pointer"
    >
      <TableCell className="py-1.5 font-medium text-muted-foreground">T{index}</TableCell>
      <TableCell className="py-1.5">
        <div className="flex min-w-0 items-center gap-2">
          <span className="min-w-0 truncate text-foreground">{modelLabel}</span>
          {errors > 0 && (
            <Badge variant="destructive" className="shrink-0">
              {errors} err
            </Badge>
          )}
        </div>
      </TableCell>
      <TableCell className="py-1.5 text-right tabular-nums text-foreground">
        {ctxIn != null ? formatTokens(ctxIn) : '—'}
      </TableCell>
      <TableCell className="py-1.5 text-right tabular-nums">
        {delta == null ? (
          <span className="text-muted-foreground">—</span>
        ) : delta >= 0 ? (
          <span className="text-foreground">+{formatTokens(delta)}</span>
        ) : (
          <span className="text-success" title="Context shrank — likely a compaction or trimmed history">
            −{formatTokens(-delta)}
          </span>
        )}
      </TableCell>
      <TableCell className="py-1.5 text-right tabular-nums">
        <span className="text-foreground">{chats.length}</span>
        {subagentChats.length > 0 && (
          <span className="ml-1 text-muted-foreground">
            +{subagentChats.length} sub{subTok > 0 ? ` · ${formatTokens(subTok)}` : ''}
          </span>
        )}
      </TableCell>
      <TableCell className="py-1.5 text-right tabular-nums text-foreground">{formatCost(totals.costUsd)}</TableCell>
    </TableRow>
  )
}
