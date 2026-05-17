import {
  ArrowPathRoundedSquareIcon,
  CommandLineIcon,
  InformationCircleIcon,
  WrenchScrewdriverIcon,
} from '@heroicons/react/24/outline'
import { useMemo, useState } from 'react'
import { contextWindowFor, formatTokens } from '#/components/context-window'
import { IconTabs } from '#/components/icon-tabs'
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from '#/components/ui/resizable'
import { ScrollArea } from '#/components/ui/scroll-area'
import { useBreakdowns } from '#/hooks/use-breakdowns'
import { useIsMobile } from '#/hooks/use-mobile'
import {
  descendantSpans,
  findOrchestratorIds,
  formatCost,
  type Span,
  spanHasError,
  subagentChatSpans,
} from '#/lib/spans'
import { extractTurns, type Turn, turnTotals } from '#/lib/turns'
import { ContextTools, collectFrontendTools, collectToolGroups } from './context'
import { displayFor, formatDuration } from './shared'
import { DetailPanel, SpanTreeList } from './tree'

type InspectorTab = 'details' | 'tools' | 'turns' | 'logs'

const INSPECTOR_TABS = [
  { id: 'details', label: 'Details', Icon: InformationCircleIcon },
  { id: 'tools', label: 'Tools', Icon: WrenchScrewdriverIcon },
  { id: 'turns', label: 'Turns', Icon: ArrowPathRoundedSquareIcon },
  { id: 'logs', label: 'Logs', Icon: CommandLineIcon },
] as const

export function SessionInspectLayout({
  spans,
  loading,
  selectedId,
  onSelect,
}: {
  spans: Span[]
  loading?: boolean
  selectedId: string | null
  onSelect: (id: string) => void
}) {
  const [inspectorTab, setInspectorTab] = useState<InspectorTab>('details')
  const isMobile = useIsMobile()
  const selectedSpan = useMemo(
    () => (selectedId ? spans.find((s) => s.id === selectedId) : undefined),
    [spans, selectedId],
  )

  return (
    <ResizablePanelGroup
      orientation={isMobile ? 'vertical' : 'horizontal'}
      className="flex h-full min-h-0 min-w-0 flex-1"
    >
      <ResizablePanel id="tree" defaultSize="33%" minSize="20%" maxSize="60%">
        <section className="h-full">
          <ScrollArea className="h-full">
            {loading && spans.length === 0 ? (
              <div className="flex h-full items-center justify-center text-xs text-muted-foreground/70">
                Loading spans…
              </div>
            ) : (
              <SpanTreeList spans={spans} selectedId={selectedId} onSelect={onSelect} />
            )}
          </ScrollArea>
        </section>
      </ResizablePanel>
      <ResizableHandle />
      <ResizablePanel id="inspector" defaultSize="67%" minSize="40%">
        <section className="flex h-full min-h-0 min-w-0 flex-col">
          {loading && spans.length === 0 ? (
            <div className="flex flex-1 items-center justify-center text-xs text-muted-foreground/70">Loading…</div>
          ) : (
            <ResizablePanelGroup orientation="vertical" className="flex h-full w-full">
              <ResizablePanel id="overview" defaultSize="28%" minSize="15%">
                <ScrollArea className="h-full">
                  <div className="min-w-0">
                    <SessionOverview spans={spans} />
                  </div>
                </ScrollArea>
              </ResizablePanel>
              <ResizableHandle />
              <ResizablePanel id="details" defaultSize="72%" minSize="25%">
                <div className="flex h-full min-h-0 min-w-0 flex-col">
                  <div className="flex shrink-0 items-center border-border border-b bg-muted/30 px-3 py-2">
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
                        <DetailPanel span={selectedSpan} spans={spans} />
                      ) : (
                        <div className="flex min-h-[8rem] items-center justify-center px-4 text-center text-xs text-muted-foreground/70">
                          Select a span in the tree for details
                        </div>
                      )
                    ) : inspectorTab === 'tools' ? (
                      <SessionTools spans={spans} selectedSpan={selectedSpan} />
                    ) : inspectorTab === 'turns' ? (
                      <SessionTurnsPanel spans={spans} />
                    ) : (
                      <SessionLogs spans={spans} />
                    )}
                  </ScrollArea>
                </div>
              </ResizablePanel>
            </ResizablePanelGroup>
          )}
        </section>
      </ResizablePanel>
    </ResizablePanelGroup>
  )
}

function SessionTools({ spans, selectedSpan }: { spans: Span[]; selectedSpan: Span | undefined }) {
  // Frontend tools are determined session-wide (their backend-execution
  // evidence doesn't move with the scope), so this is computed off the full
  // span list and passed in even when the visible groups are scoped to a
  // single agent.
  const frontendNames = useMemo(() => new Set(collectFrontendTools(spans).map((t) => t.name)), [spans])

  const groups = useMemo(() => {
    const scope = selectedSpan
      ? selectedSpan.operation === 'invoke_agent'
        ? [selectedSpan, ...descendantSpans(spans, selectedSpan.id)]
        : [selectedSpan]
      : spans
    return collectToolGroups(scope, frontendNames)
  }, [spans, selectedSpan, frontendNames])

  const totals = useMemo(() => {
    let count = 0
    let tokens = 0
    for (const group of groups) {
      count += group.tools.length
      tokens += group.tokens
    }
    return { count, tokens }
  }, [groups])

  const scopeLabel =
    selectedSpan?.operation === 'invoke_agent'
      ? (selectedSpan.agentName ?? selectedSpan.name)
      : selectedSpan
        ? displayFor(selectedSpan).name
        : 'All agents'

  return (
    <div className="px-4 py-4">
      <header className="mb-3 flex items-baseline justify-between gap-2 text-[11px]">
        <span className="truncate font-medium text-foreground">{scopeLabel}</span>
        <span className="shrink-0 tabular-nums text-muted-foreground">
          {totals.count} tool{totals.count === 1 ? '' : 's'} ·{' '}
          {totals.tokens ? `${formatTokens(totals.tokens)} tokens` : '—'}
        </span>
      </header>
      <ContextTools groups={groups} />
    </div>
  )
}

function SessionLogs({ spans }: { spans: Span[] }) {
  const logs = useMemo(() => {
    let first = spans[0]?.startMs ?? Date.now()
    let toolCount = 0
    let chatCount = 0
    for (const span of spans) {
      if (span.startMs < first) first = span.startMs
      if (span.operation === 'tool') toolCount++
      else if (span.operation === 'chat') chatCount++
    }
    return [
      { t: first, level: 'info', source: 'session', message: 'Session inspection opened' },
      { t: first + 420, level: 'debug', source: 'trace', message: `${spans.length} spans loaded into the drawer` },
      {
        t: first + 980,
        level: 'info',
        source: 'llm',
        message: `${chatCount} chat spans summarized for token breakdown`,
      },
      { t: first + 1420, level: 'debug', source: 'tools', message: `${toolCount} tool spans correlated with turns` },
    ].map((log) => ({ ...log, timeStr: new Date(log.t).toLocaleTimeString() }))
  }, [spans])

  return (
    <div className="px-4 py-3">
      <div className="overflow-hidden rounded-md bg-muted text-[11px] text-foreground shadow-inner ring-1 ring-border">
        {logs.map((log, index) => (
          <div
            key={`${log.source}-${log.t}`}
            className={[
              'grid grid-cols-[5.75rem_3.5rem_4.5rem_1fr] gap-2 px-3 py-2 font-mono',
              index > 0 ? 'border-border border-t' : '',
            ].join(' ')}
          >
            <span className="text-muted-foreground">{log.timeStr}</span>
            <span className={log.level === 'info' ? 'text-foreground' : 'text-muted-foreground'}>{log.level}</span>
            <span className="text-muted-foreground">{log.source}</span>
            <span className="min-w-0 truncate">{log.message}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

function SessionOverview({ spans }: { spans: Span[] }) {
  const orchestratorIds = useMemo(() => findOrchestratorIds(spans), [spans])
  const turns = useMemo(() => extractTurns(spans, orchestratorIds), [spans, orchestratorIds])
  const chatSpans = useMemo(() => turns.flatMap((turn) => turn.chats), [turns])
  const { ready, total } = useBreakdowns(chatSpans)
  const orchestrator = orchestratorIds[0] ? spans.find((span) => span.id === orchestratorIds[0]) : undefined
  const agent = orchestrator?.agentName ?? orchestrator?.name ?? 'Session'

  const totals = useMemo(() => {
    let input = 0
    let output = 0
    let cached = 0
    let cost = 0
    let errors = 0
    let duration = 0
    for (const turn of turns) {
      const t = turnTotals(turn)
      input += t.inputTokens
      output += t.outputTokens
      cached += t.cachedTokens
      cost += t.costUsd
      errors += turn.actions.filter(spanHasError).length
      duration += t.durationMs
    }
    return { input, output, cached, cost, errors, duration }
  }, [turns])

  const subagent = useMemo(() => {
    let tokens = 0
    let cost = 0
    for (const span of subagentChatSpans(spans)) {
      tokens += (span.inputTokens ?? 0) + (span.outputTokens ?? 0)
      cost += span.costUsd ?? 0
    }
    return { tokens, cost }
  }, [spans])

  const peak = useMemo(() => {
    let peakSpan: Span | null = null
    for (const span of spans) {
      if (span.operation !== 'chat') continue
      if ((span.inputTokens ?? 0) > (peakSpan?.inputTokens ?? 0)) peakSpan = span
    }
    return peakSpan
  }, [spans])

  const inputTokens = total.inputTokens || totals.input
  const outputTokens = total.outputTokens || totals.output
  const cachedTokens = total.cachedTokens || totals.cached
  const allTokens = inputTokens + outputTokens + subagent.tokens
  const cachePct = inputTokens > 0 ? Math.round((cachedTokens / inputTokens) * 100) : 0
  const totalCost = totals.cost + subagent.cost
  const costStr = formatCost(totalCost) ?? ''

  const peakIn = peak?.inputTokens ?? 0
  const peakWindow = contextWindowFor(peak?.model)
  const peakPct = peakWindow ? Math.min(1, peakIn / peakWindow) : 0

  if (orchestratorIds.length === 0) {
    return (
      <div className="px-4 py-5 text-center text-xs text-muted-foreground/70">
        No agent invocation found in this session.
      </div>
    )
  }

  return (
    <section className="flex flex-col overflow-hidden">
      <header className="shrink-0 px-4 pt-3 pb-2">
        <div className="min-w-0">
          <div className="truncate text-sm font-semibold text-foreground">{agent}</div>
          <div className="mt-0.5 text-[11px] text-muted-foreground">
            {turns.length} turn{turns.length === 1 ? '' : 's'} · {formatDuration(totals.duration)}
          </div>
        </div>
        <div className="mt-2 flex flex-wrap items-baseline gap-x-3 gap-y-1 text-[11px] tabular-nums">
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
          <span className="text-muted-foreground/60">·</span>
          <span className={cachedTokens > 0 ? 'text-success' : 'text-muted-foreground'}>
            {cachedTokens > 0 ? `${formatTokens(cachedTokens)} cached (${cachePct}%)` : 'no cache'}
          </span>
          <span className="text-muted-foreground/60">·</span>
          <span className="text-foreground">
            <span className="font-semibold">{costStr ? `$${costStr}` : '—'}</span>
          </span>
          <span className="text-muted-foreground/60">·</span>
          <span className={totals.errors > 0 ? 'text-destructive' : 'text-muted-foreground'}>
            {totals.errors > 0 ? `${totals.errors} err` : '0 err'}
          </span>
        </div>
      </header>

      <div className="shrink-0 border-border border-t px-4 py-3">
        <div className="flex items-baseline justify-between gap-3">
          <div className="flex items-baseline gap-2 text-[11px]">
            <span className="font-medium text-foreground">Context breakdown</span>
            {peakWindow && <span className="tabular-nums text-muted-foreground">{(peakPct * 100).toFixed(0)}%</span>}
            <span className={`text-[10px] text-muted-foreground ${ready ? 'opacity-0' : 'opacity-100'}`}>
              counting…
            </span>
          </div>
          {peakWindow && (
            <span className="text-[10px] tabular-nums text-muted-foreground">
              ~{formatTokens(peakIn)} / {formatTokens(peakWindow)} Tokens
            </span>
          )}
        </div>
        <ContextBreakdown
          systemTokens={total.systemTokens}
          toolDefsTokens={total.toolDefsTokens}
          messagesTokens={total.messagesTokens}
          subagentTokens={subagent.tokens}
        />
      </div>
    </section>
  )
}

function SessionTurnsPanel({ spans }: { spans: Span[] }) {
  const orchestratorIds = useMemo(() => findOrchestratorIds(spans), [spans])
  const turns = useMemo(() => extractTurns(spans, orchestratorIds), [spans, orchestratorIds])
  const errorCount = useMemo(
    () => turns.reduce((sum, turn) => sum + turn.actions.filter(spanHasError).length, 0),
    [turns],
  )

  if (turns.length === 0) {
    return (
      <div className="flex min-h-[8rem] items-center justify-center px-4 text-center text-xs text-muted-foreground/70">
        No turns in this session.
      </div>
    )
  }

  return (
    <div className="px-4 py-4">
      <div className="mb-2 flex items-center justify-between text-[11px] font-medium text-muted-foreground">
        <span>
          {turns.length} turn{turns.length === 1 ? '' : 's'}
        </span>
        {errorCount > 0 && <span className="tabular-nums text-destructive">{errorCount} errors</span>}
      </div>
      <ol className="space-y-1.5">
        {turns.map((turn, index) => (
          <SessionTurnRow key={turn.run.id} turn={turn} index={index + 1} />
        ))}
      </ol>
    </div>
  )
}

const SEGMENT_COLORS = {
  system: 'bg-muted-foreground/60',
  tools: 'bg-indigo-300 dark:bg-indigo-400',
  messages: 'bg-orange-300 dark:bg-orange-400',
  subagents: 'bg-sky-300 dark:bg-sky-400',
} as const

export type ContextSegmentKey = keyof typeof SEGMENT_COLORS

export interface ContextSegment {
  key: ContextSegmentKey
  label: string
  tokens: number
  pct: number
}

export function computeContextSegments(input: {
  systemTokens: number
  toolDefsTokens: number
  messagesTokens: number
  subagentTokens: number
}): ContextSegment[] {
  const raw = [
    { key: 'system' as const, label: 'System', tokens: input.systemTokens },
    { key: 'tools' as const, label: 'Tools', tokens: input.toolDefsTokens },
    { key: 'messages' as const, label: 'Messages', tokens: input.messagesTokens },
    { key: 'subagents' as const, label: 'Subagents', tokens: input.subagentTokens },
  ]
  const denom = raw.reduce((acc, s) => acc + s.tokens, 0) || 1
  return raw.map((s) => ({ ...s, pct: s.tokens > 0 ? Math.round((s.tokens / denom) * 100) : 0 }))
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
      <ul className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px]">
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

function SessionTurnRow({ turn, index }: { turn: Turn; index: number }) {
  const { run, chats, actions } = turn
  const errors = actions.filter(spanHasError).length
  const totals = turnTotals(turn)
  const tokenTotal = totals.inputTokens + totals.outputTokens
  const cachePct = totals.inputTokens > 0 ? Math.round((totals.cachedTokens / totals.inputTokens) * 100) : 0
  const cost = formatCost(totals.costUsd)
  const modelLabel = totals.model ?? run.agentName ?? run.name
  const callCount = chats.length

  return (
    <li className="grid grid-cols-[2.75rem_1fr_auto] items-center gap-2 rounded-md px-2 py-1.5 text-[11px] ring-1 ring-border">
      <span className="font-medium text-muted-foreground">T{index}</span>
      <span className="min-w-0 truncate text-foreground">
        {modelLabel}
        {callCount > 1 && <span className="ml-1.5 text-muted-foreground">· {callCount} calls</span>}
      </span>
      <span className="flex shrink-0 items-center gap-2 tabular-nums text-muted-foreground">
        {errors ? <span className="text-destructive">{errors} err</span> : null}
        <span>{tokenTotal ? formatTokens(tokenTotal) : '—'} tok</span>
        {totals.cachedTokens > 0 && (
          <span className="text-success">
            {formatTokens(totals.cachedTokens)} cached ({cachePct}%)
          </span>
        )}
        <span>{cost ? `$${cost}` : '—'}</span>
      </span>
    </li>
  )
}
