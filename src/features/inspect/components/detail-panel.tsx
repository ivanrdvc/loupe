import { useQuery } from '@tanstack/react-query'
import { Braces, Check, ChevronDown, Copy } from 'lucide-react'
import { type ReactNode, useMemo, useState } from 'react'
import { CodeBlock } from '#/components/ai-elements/code-block'
import { JsonTree } from '#/components/ai-elements/json-tree'
import { JsonView } from '#/components/ai-elements/json-view'
import { ToolInput, ToolOutput } from '#/components/ai-elements/tool'
import { StatusDot } from '#/components/status-dot'
import { Badge } from '#/components/ui/badge'
import { Button } from '#/components/ui/button'
import { Card, CardContent } from '#/components/ui/card'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '#/components/ui/collapsible'
import { Toggle } from '#/components/ui/toggle'
import { ReviewSheetButton } from '#/features/evaluation'
import { formatTokens } from '#/features/inspect/components/context-window'
import { useBreakdowns } from '#/features/inspect/components/use-breakdowns'
import { type InspectorView, isChatSpan, type ToolCallResolution } from '#/features/inspect/logic'
import { fetchSessionLogs } from '#/features/inspect/server/logs'
import { formatCost } from '#/lib/format'
import { type JsonValue, parseJson, prettyJson } from '#/lib/json'
import { queryKeys } from '#/lib/query-keys'
import type { RetrievalDocument, Span } from '#/lib/spans'
import {
  asMessages,
  type ChatMessage,
  type MessagePart,
  type MessageRole,
  turnTailStart,
} from '#/lib/spans/conversation'
import type { LogLevel } from '#/lib/telemetry/types'
import { ACCENT, toolTone } from '#/lib/tone'
import { cn } from '#/lib/utils'
import { computeContextSegments, SEGMENT_COLORS } from './context-segments'
import { displayFor, fmtNum, formatDuration } from './shared'
import { TruncatedAttrFallback } from './truncated-attr-fallback'

export function DetailPanel({
  span,
  view,
  onSelect,
}: {
  span: Span
  view?: InspectorView
  onSelect?: (id: string) => void
}) {
  const duration = span.endMs - span.startMs
  const http = span.operation === 'http' ? httpSummary(span) : null
  const display = displayFor(span, view?.agentLabels)
  const systemPrompt = view?.systemPromptByAgent.get(span.id)
  const nestedErrors = useMemo<Span[]>(() => view?.descendantErrors(span.id) ?? [], [view, span.id])

  return (
    <div className="flex min-w-0 max-w-full flex-col gap-4 px-4 py-4">
      <div className="flex min-w-0 items-center gap-2">
        {display.tagLabel && (
          <Badge variant="outline" className="px-1.5 text-muted-foreground">
            {display.tagIcon && <display.tagIcon className={`size-3 ${display.tagColor ?? ''}`} aria-hidden />}
            {display.tagLabel}
          </Badge>
        )}
        <span className="min-w-0 flex-1 truncate text-base font-semibold text-foreground">{display.name}</span>
        {span.model && (
          <Badge variant="eyebrow" className="shrink-0" title={span.provider ?? undefined}>
            <StatusDot className="text-violet-500" />
            {span.model}
          </Badge>
        )}
        {display.purposeLabel && (
          <span className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] font-medium ${display.purposeCls}`}>
            {display.purposeLabel}
          </span>
        )}
        {span.operation !== 'http' && (
          <ReviewSheetButton
            targetKind="span"
            targetId={span.id}
            parentTraceId={span.traceId}
            parentSessionId={span.sessionId ?? null}
          />
        )}
      </div>

      {(span.errorMessage || span.errorType || nestedErrors.length > 0) && (
        <div className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2">
          {(span.errorMessage || span.errorType) && (
            <>
              <ErrorLine type={span.errorType} message={span.errorMessage} size="md" />
              {span.errorStack && (
                <pre className="mt-1.5 whitespace-pre-wrap break-words font-mono text-[11px] leading-relaxed text-muted-foreground">
                  {span.errorStack}
                </pre>
              )}
            </>
          )}
          {nestedErrors.map((child) => (
            <button
              key={child.id}
              type="button"
              onClick={() => onSelect?.(child.id)}
              disabled={!onSelect}
              className="mt-2 block w-full rounded border-l-2 border-destructive/40 bg-destructive/5 px-2 py-1.5 text-left transition-colors enabled:cursor-pointer enabled:hover:bg-destructive/10 disabled:cursor-default"
            >
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground">caused by · {child.name}</div>
              <ErrorLine type={child.errorType} message={child.errorMessage} size="sm" />
            </button>
          ))}
        </div>
      )}

      <dl className="grid min-w-0 grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-1 text-xs">
        <Stat label="Duration" value={formatDuration(duration)} />
        {http?.url && <Stat label="URL" value={http.url} />}
        {http?.status && <Stat label="Status" value={http.status} />}
        {span.ttftMs != null && <Stat label="TTFT" value={formatDuration(span.ttftMs)} />}
        {span.inputTokens != null && <Stat label="Input" value={fmtNum(span.inputTokens)} />}
        {span.outputTokens != null && <Stat label="Output" value={fmtNum(span.outputTokens)} />}
        {span.cachedTokens != null && span.cachedTokens > 0 && (
          <Stat label="Cached" value={fmtNum(span.cachedTokens)} />
        )}
        {span.reasoningTokens != null && span.reasoningTokens > 0 && (
          <Stat label="Reasoning" value={fmtNum(span.reasoningTokens)} />
        )}
        {span.tokens != null && <Stat label="Tokens" value={fmtNum(span.tokens)} />}
        {span.costUsd ? <Stat label="Cost" value={formatCost(span.costUsd)} /> : null}
        {span.embeddingDimensions != null && <Stat label="Dimensions" value={fmtNum(span.embeddingDimensions)} />}
        {span.dataSourceId && <Stat label="Data source" value={span.dataSourceId} />}
        {span.retrievalDocuments && <Stat label="Documents" value={fmtNum(span.retrievalDocuments.length)} />}
        {span.agentId && <Stat label="Agent id" value={span.agentId} />}
        {span.finishReasons && span.finishReasons.length > 0 && (
          <Stat label="Finish" value={span.finishReasons.join(', ')} />
        )}
        {span.responseId && <Stat label="Response id" value={span.responseId} />}
        {span.systemFingerprint && <Stat label="Fingerprint" value={span.systemFingerprint} />}
      </dl>

      {isChatSpan(span) && <SpanContextBreakdown span={span} />}

      {(span.retrievalQuery || span.retrievalDocuments) && (
        <RetrievalBlock query={span.retrievalQuery} docs={span.retrievalDocuments} />
      )}

      {span.agentDescription && <RoleCard kind="agent" label="description" content={span.agentDescription} />}
      {systemPrompt ? (
        <RoleCard kind="system" label="system prompt" content={systemPrompt} />
      ) : span.truncatedAttrs?.systemInstructions ? (
        <TruncatedAttrFallback span={span} field="systemInstructions" />
      ) : null}

      {span.truncatedAttrs?.toolDefinitions && <TruncatedAttrFallback span={span} field="toolDefinitions" />}
      {span.inputParams &&
        (span.truncatedAttrs?.inputParams ? (
          <TruncatedAttrFallback span={span} field="inputParams" />
        ) : (
          <JsonBlock label="Input" raw={span.inputParams} />
        ))}
      {span.toolResult != null &&
        (span.truncatedAttrs?.toolResult ? (
          <TruncatedAttrFallback span={span} field="toolResult" />
        ) : (
          <JsonBlock label="Result" value={span.toolResult} />
        ))}
      {isChatSpan(span) && span.llmInput == null && span.inputTokens != null && span.inputTokens > 0 && (
        <TruncatedAttrFallback span={span} field="llmInput" tokens={span.inputTokens} />
      )}
      {(span.llmInput != null || span.llmOutput != null) && (
        <MessagesBlock input={span.llmInput} output={span.llmOutput} outputType={span.outputType} view={view} />
      )}
      <SpanLogsBlock span={span} view={view} />
    </div>
  )
}

function SpanContextBreakdown({ span }: { span: Span }) {
  const { ready, total } = useBreakdowns([span])
  const hasSignal = span.llmInput != null || span.toolDefinitions != null
  if (!hasSignal) return null
  // Reserve the bar's space while the async breakdown loads, else the panel
  // shifts when it pops in — a flash on every span select.
  if (!ready)
    return (
      <div className="flex flex-col gap-1.5">
        <div className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Context breakdown</div>
        <div className="h-1.5 w-full animate-shimmer rounded-full bg-muted" />
        <div className="h-4" />
      </div>
    )
  if (!total.inputTokens) return null

  const segments = computeContextSegments({
    systemTokens: total.systemTokens,
    toolDefsTokens: total.toolDefsTokens,
    messagesTokens: total.messagesTokens,
    subagentTokens: 0,
  })
  const hasAny = segments.some((s) => s.tokens > 0)
  if (!hasAny) return null

  const denom = segments.reduce((acc, s) => acc + s.tokens, 0) || 1

  return (
    <div className="flex flex-col gap-1.5">
      <div className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Context breakdown</div>
      <div className="flex h-1.5 w-full overflow-hidden rounded-full bg-muted">
        {segments.map((s) => (
          <div
            key={s.key}
            className={`${SEGMENT_COLORS[s.key]} transition-opacity duration-75`}
            style={{ width: `${(s.tokens / denom) * 100}%` }}
          />
        ))}
      </div>
      <ul className="flex flex-wrap gap-x-3 gap-y-0.5 text-xs tabular-nums">
        {segments.map((s) =>
          s.tokens > 0 ? (
            <li key={s.key} className="inline-flex items-center gap-1">
              <span className={`size-1.5 rounded-full ${SEGMENT_COLORS[s.key]}`} />
              <span className="text-muted-foreground">{s.label}</span>
              <span className="text-foreground">{formatTokens(s.tokens)}</span>
              <span className="text-muted-foreground">· {s.pct}%</span>
            </li>
          ) : null,
        )}
      </ul>
    </div>
  )
}

function SpanLogsBlock({ span, view }: { span: Span; view?: InspectorView }) {
  // Shares the React Query cache key with SessionLogsPanel so both panels
  // dedupe the same fetch.
  const spans = view?.spans
  const traceIds = useMemo(() => {
    const all = spans ?? [span]
    return [...new Set(all.map((s) => s.traceId).filter(Boolean))].sort()
  }, [spans, span])
  const window = useMemo(() => {
    const all = spans && spans.length > 0 ? spans : [span]
    let from = all[0].startMs
    let to = all[0].endMs
    for (const s of all) {
      if (s.startMs < from) from = s.startMs
      if (s.endMs > to) to = s.endMs
    }
    return { fromUs: from * 1000, toUs: to * 1000 }
  }, [spans, span])

  const { data } = useQuery({
    queryKey: queryKeys.logs.byTraceIds(traceIds),
    queryFn: () => fetchSessionLogs({ data: { traceIds, ...window } }),
    enabled: traceIds.length > 0,
    staleTime: 30_000,
  })

  const spanLogs = useMemo(() => {
    const logs = data?.logs ?? []
    return logs.filter((l) => l.spanId === span.id)
  }, [data?.logs, span.id])

  if (spanLogs.length === 0) return null
  return (
    <section className="min-w-0">
      <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Logs</div>
      <div className="mt-1.5 divide-y divide-border rounded-md border border-border">
        {spanLogs.map((log, i) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: id collides when two lines share a ms; frozen ordered list
          <div key={`${log.id}-${i}`} className="flex items-start gap-2 px-2.5 py-1.5 text-[11px]">
            <Badge variant={LEVEL_BADGE[log.level]} className="shrink-0 font-mono text-[9px] uppercase">
              {log.level}
            </Badge>
            <span className="min-w-0 flex-1 break-words font-mono text-foreground">
              {log.message || '(no message)'}
            </span>
          </div>
        ))}
      </div>
    </section>
  )
}

const LEVEL_BADGE: Record<LogLevel, 'outline' | 'secondary' | 'warning' | 'destructive'> = {
  trace: 'outline',
  debug: 'outline',
  info: 'secondary',
  warn: 'warning',
  error: 'destructive',
  fatal: 'destructive',
}

function MessagesBlock({
  input,
  output,
  outputType,
  view,
}: {
  input?: JsonValue
  output?: JsonValue
  outputType?: string
  view?: InspectorView
}) {
  const inputMsgs = useMemo(() => asMessages(input), [input])
  const outputMsgs = useMemo(() => asMessages(output), [output])
  // Tool results live on the sibling execute_tool span — asMessages drops
  // tool-role messages — so we splice them back in keyed by tool_call id.
  const callResolutions = view?.callResolutions ?? new Map<string, ToolCallResolution>()
  const structured = outputType && outputType !== 'text' ? outputType : undefined

  const tailStart = useMemo(() => turnTailStart(inputMsgs), [inputMsgs])
  const history = inputMsgs.slice(0, tailStart)
  const turnInput = inputMsgs.slice(tailStart)

  // If parser produced nothing usable, fall back to raw JSON so we don't hide data.
  if (inputMsgs.length === 0 && outputMsgs.length === 0) {
    return (
      <>
        {input != null && <JsonBlock label="LLM Input" value={input} />}
        {output != null && <JsonBlock label="LLM Output" value={output} />}
      </>
    )
  }
  return (
    <section className="flex min-w-0 flex-col gap-3">
      {turnInput.length > 0 && (
        <PanelSection label="Input" copyText={prettyJson(input)} raw={<JsonTree value={input} />}>
          <div className="min-w-0 divide-y divide-border/60">
            {history.length > 0 && <HistoryDisclosure msgs={history} callResolutions={callResolutions} />}
            {turnInput.map((msg, i) => (
              // biome-ignore lint/suspicious/noArrayIndexKey: message positions are stable for a frozen span
              <MessageCard key={`in-${tailStart + i}`} msg={msg} callResolutions={callResolutions} />
            ))}
          </div>
        </PanelSection>
      )}
      {outputMsgs.length > 0 && (
        <PanelSection label="Output" copyText={prettyJson(output)} raw={<JsonTree value={output} />}>
          <div className="min-w-0 divide-y divide-border/60">
            {outputMsgs.map((msg, i) => (
              <MessageCard
                // biome-ignore lint/suspicious/noArrayIndexKey: message positions are stable for a frozen span
                key={`out-${i}`}
                msg={msg}
                response
                structured={structured}
                callResolutions={callResolutions}
              />
            ))}
          </div>
        </PanelSection>
      )}
    </section>
  )
}

type RoleKey = MessageRole | 'agent'
const ROLE_LABELS: Record<RoleKey, string> = {
  system: 'System',
  user: 'User',
  assistant: 'Assistant',
  agent: 'Agent',
}
const ROLE_TONE: Record<RoleKey, string> = {
  system: 'bg-muted text-muted-foreground',
  user: ACCENT.cyan.badge,
  assistant: ACCENT.violet.badge,
  agent: ACCENT.emerald.badge,
}

function RoleChip({ role }: { role: RoleKey }) {
  return (
    <span
      className={`inline-flex h-4 shrink-0 items-center rounded-full px-1.5 text-[10px] font-medium ${ROLE_TONE[role]}`}
    >
      {ROLE_LABELS[role]}
    </span>
  )
}

function HistoryDisclosure({
  msgs,
  callResolutions,
}: {
  msgs: ChatMessage[]
  callResolutions: Map<string, ToolCallResolution>
}) {
  const [open, setOpen] = useState(false)
  return (
    <Collapsible open={open} onOpenChange={setOpen} className="min-w-0 py-2.5 first:pt-0 last:pb-0">
      <CollapsibleTrigger asChild>
        <button
          type="button"
          className="flex w-full items-center gap-1.5 rounded-md border border-dashed border-border px-2 py-1 text-[11px] text-muted-foreground transition-colors hover:text-foreground"
        >
          <ChevronDown className={`size-3 transition-transform ${open ? 'rotate-180' : ''}`} />
          {open ? 'Hide' : 'Show'} {msgs.length} earlier {msgs.length === 1 ? 'message' : 'messages'}
        </button>
      </CollapsibleTrigger>
      <CollapsibleContent className="mt-2 min-w-0 divide-y divide-border/60 data-[state=closed]:animate-out data-[state=open]:animate-in">
        {msgs.map((msg, i) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: message positions are stable for a frozen span
          <MessageCard key={`hist-${i}`} msg={msg} callResolutions={callResolutions} />
        ))}
      </CollapsibleContent>
    </Collapsible>
  )
}

function MessageCard({
  msg,
  response,
  structured,
  callResolutions,
}: {
  msg: ChatMessage
  response?: boolean
  structured?: string
  callResolutions: Map<string, ToolCallResolution>
}) {
  const isStructured = Boolean(response && structured)
  return (
    <div className="flex min-w-0 flex-col gap-2 py-2.5 first:pt-0 last:pb-0">
      <div className="flex items-center gap-2">
        <RoleChip role={msg.role} />
        {isStructured && (
          <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
            structured · {structured}
          </span>
        )}
      </div>
      <div className="min-w-0 space-y-2">
        {msg.parts.map((part, i) => {
          const partKey = 'id' in part ? part.id : `msg-part-${i}`
          return (
            <MessagePartView
              key={partKey}
              part={part}
              structured={isStructured}
              role={msg.role}
              callResolutions={callResolutions}
            />
          )
        })}
      </div>
    </div>
  )
}

function RetrievalBlock({ query, docs }: { query?: string; docs?: RetrievalDocument[] }) {
  const ranked = docs ? [...docs].sort((a, b) => (b.score ?? 0) - (a.score ?? 0)) : []
  return (
    <section className="flex min-w-0 flex-col gap-2">
      {query && (
        <div className="flex min-w-0 flex-col gap-1">
          <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Query</div>
          <pre className="whitespace-pre-wrap break-words font-sans text-xs leading-relaxed text-foreground">
            {query}
          </pre>
        </div>
      )}
      {ranked.length > 0 && (
        <div className="flex min-w-0 flex-col gap-1">
          <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            Retrieved · {ranked.length}
          </div>
          <ul className="divide-y divide-border rounded-md border border-border">
            {ranked.map((doc) => (
              <li key={doc.id} className="flex items-center gap-2 px-2.5 py-1.5 text-[11px]">
                <span className="min-w-0 flex-1 truncate font-mono text-foreground" title={doc.id}>
                  {doc.id}
                </span>
                {doc.score != null && (
                  <span className="shrink-0 tabular-nums text-muted-foreground">{doc.score.toFixed(3)}</span>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  )
}

function RoleCard({ kind, label, content }: { kind: RoleKey; label: string; content: string }) {
  return (
    <Card size="sm" className="min-w-0 gap-2">
      <CardContent className="flex min-w-0 flex-col gap-2">
        <div className="flex items-center gap-2">
          <RoleChip role={kind} />
          <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">{label}</span>
        </div>
        <CollapsibleText content={content} />
      </CardContent>
    </Card>
  )
}

function MessagePartView({
  part,
  structured,
  role,
  callResolutions,
}: {
  part: MessagePart
  structured?: boolean
  role: MessageRole
  callResolutions: Map<string, ToolCallResolution>
}) {
  if (part.kind === 'text') {
    if (structured) return <StructuredText content={part.content} />
    if (role === 'system') return <CollapsibleText content={part.content} />
    return (
      <pre className="whitespace-pre-wrap break-words font-sans text-xs leading-relaxed text-foreground">
        {part.content}
      </pre>
    )
  }
  if (part.kind === 'tool_call') {
    const resolved = callResolutions.get(part.id)
    const subAgent = resolved?.subAgent
    const subAgentName = subAgent?.agentName ?? subAgent?.name
    const tone = toolTone(subAgent ? 'agent' : 'tool')
    const hasResult = resolved?.result !== undefined
    const errored = resolved && !resolved.success
    return (
      <Collapsible className={`group min-w-0 overflow-hidden rounded-lg border p-2.5 ${tone.border}`}>
        <CollapsibleTrigger className="flex w-full min-w-0 items-center gap-2 text-[11px]">
          <span
            className={`inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium ${tone.badge}`}
          >
            <tone.icon className="size-3" />
            {tone.label}
          </span>
          {/* biome-ignore lint/a11y/noStaticElementInteractions: stop drag-select inside the trigger from toggling the collapsible */}
          <span
            className={`min-w-0 truncate font-mono ${ACCENT.violet.ident}`}
            title={part.name}
            onMouseDown={(e) => e.stopPropagation()}
          >
            {part.name}
          </span>
          {subAgent && subAgentName && subAgentName !== part.name && (
            <span className="min-w-0 truncate text-muted-foreground" title={subAgentName}>
              → {subAgentName}
            </span>
          )}
          {errored && (
            <span className="shrink-0 rounded bg-destructive/10 px-1.5 py-0.5 text-[10px] font-medium text-destructive">
              error
            </span>
          )}
          {/* biome-ignore lint/a11y/noStaticElementInteractions: stop drag-select inside the trigger from toggling the collapsible */}
          <span
            className="ml-auto min-w-0 max-w-[12rem] shrink truncate rounded-full bg-muted px-2 py-0.5 font-mono text-[10px] text-muted-foreground"
            title={part.id}
            onMouseDown={(e) => e.stopPropagation()}
          >
            {part.id}
          </span>
          <ChevronDown className="size-3 shrink-0 text-muted-foreground transition-transform group-data-[state=open]:rotate-180" />
        </CollapsibleTrigger>
        <CollapsibleContent className="mt-2 min-w-0 space-y-3 data-[state=closed]:animate-out data-[state=open]:animate-in">
          {part.arguments != null && <ToolInput input={part.arguments} />}
          {resolved?.error && (
            <div className="rounded-md border border-destructive/30 bg-destructive/10 px-2.5 py-2">
              <ErrorLine type={resolved.error.kind} message={resolved.error.message} size="sm" />
              {resolved.error.stack && (
                <pre className="mt-1.5 max-h-64 overflow-auto whitespace-pre-wrap break-words font-mono text-[11px] leading-relaxed text-muted-foreground">
                  {resolved.error.stack}
                </pre>
              )}
            </div>
          )}
          {resolved?.span.truncatedAttrs?.toolResult ? (
            <TruncatedAttrFallback span={resolved.span} field="toolResult" />
          ) : (
            hasResult && <ToolOutput output={resolved.result} errorText={undefined} />
          )}
        </CollapsibleContent>
      </Collapsible>
    )
  }
  return <JsonView value={part.response} />
}

function StructuredText({ content }: { content: string }) {
  const parsed = parseJson(content)
  if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
    const entries = Object.entries(parsed as Record<string, unknown>)
    if (entries.length === 1 && typeof entries[0][1] === 'string') {
      const [key, value] = entries[0]
      return (
        <div className="flex flex-wrap items-baseline gap-1.5">
          <span className={`rounded bg-muted px-1.5 py-0.5 font-mono text-[10px] ${ACCENT.violet.ident}`}>{key}</span>
          <span className="text-xs leading-relaxed text-foreground">{value}</span>
        </div>
      )
    }
  }
  if (parsed !== undefined) {
    return <JsonView value={parsed} />
  }
  return <pre className="whitespace-pre-wrap break-words text-xs leading-snug text-foreground">{content}</pre>
}

function CollapsibleText({ content }: { content: string }) {
  const [open, setOpen] = useState(false)
  if (content.length <= 240) {
    return (
      <pre className="whitespace-pre-wrap break-words font-sans text-xs leading-relaxed text-foreground">{content}</pre>
    )
  }
  const preview = `${content.slice(0, 240).trimEnd()}…`
  return (
    <Collapsible open={open} onOpenChange={setOpen} className="min-w-0">
      <pre className="whitespace-pre-wrap break-words font-sans text-xs leading-relaxed text-foreground">
        {open ? content : preview}
      </pre>
      <CollapsibleTrigger asChild>
        <button type="button" className="mt-1 text-[11px] font-medium text-primary hover:underline">
          {open ? 'Show less' : `Show all (${content.length.toLocaleString()} chars)`}
        </button>
      </CollapsibleTrigger>
    </Collapsible>
  )
}

function ErrorLine({ type, message, size }: { type?: string; message?: string; size: 'md' | 'sm' }) {
  const cls = size === 'md' ? 'text-[13px] font-medium leading-snug' : 'mt-0.5 text-[12px] leading-snug'
  return (
    <div className={`${cls} text-destructive`}>
      {type && (
        <span className="font-mono">
          {type}
          {message ? ': ' : ''}
        </span>
      )}
      {message}
    </div>
  )
}

// http spans have no typed fields — read URL/status from the attribute bag.
function httpSummary(span: Span): { url?: string; status?: string } {
  const attrs = span.rawAttributes
  if (!attrs) return {}
  const pick = (keys: string[]): string | undefined => {
    for (const k of keys) {
      const v = attrs[k]
      if (typeof v === 'string' && v) return v
      if (typeof v === 'number') return String(v)
    }
    return undefined
  }
  return {
    url: pick(['url.full', 'url_full', 'http.url', 'http_url', 'data', 'url', 'http.target', 'http_target']),
    status: pick(['http.response.status_code', 'http_response_status_code', 'http.status_code', 'resultCode']),
  }
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <>
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="min-w-0 break-words tabular-nums text-foreground">{value}</dd>
    </>
  )
}

function PanelSection({
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
      <div className="flex items-center gap-1 border-b bg-muted/50 py-1 pl-2.5 pr-1">
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

function JsonBlock({ label, value, raw }: { label: string; value?: unknown; raw?: string }) {
  const resolved = useMemo(() => {
    const v = raw != null ? (parseJson(raw) ?? raw) : value
    return typeof v === 'string' ? (parseJson(v) ?? v) : v
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
