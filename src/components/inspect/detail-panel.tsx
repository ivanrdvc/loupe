import { ArrowDown01Icon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { useQuery } from '@tanstack/react-query'
import { useMemo, useState } from 'react'
import { JsonView } from '#/components/ai-elements/json-view'
import { ToolInput, ToolOutput } from '#/components/ai-elements/tool'
import { formatTokens } from '#/components/context-window'
import { Badge } from '#/components/ui/badge'
import { Card, CardContent } from '#/components/ui/card'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '#/components/ui/collapsible'
import { useBreakdowns } from '#/hooks/use-breakdowns'
import { asMessages, type ChatMessage, type MessagePart, type MessageRole } from '#/lib/conversation'
import { formatCost } from '#/lib/format'
import { type InspectorView, isChatSpan, type ToolCallResolution } from '#/lib/inspector-view'
import { type JsonValue, parseJson } from '#/lib/json'
import { queryKeys } from '#/lib/query-keys'
import type { Span } from '#/lib/spans'
import type { LogLevel } from '#/lib/telemetry/types'
import { NoteSheetButton } from '#/routes/notes/-components/note-sheet-button'
import { fetchSessionLogs } from '#/server/logs'
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
  const display = displayFor(span, view?.agentLabels)
  const systemPrompt = view?.systemPromptByAgent.get(span.id)
  const nestedErrors = useMemo<Span[]>(() => view?.descendantErrors(span.id) ?? [], [view, span.id])

  return (
    <div className="flex min-w-0 max-w-full flex-col gap-4 px-4 py-4">
      <div className="flex min-w-0 items-center gap-2">
        {display.tagLabel && (
          <Badge variant="outline" className="px-1.5 text-muted-foreground">
            {display.tagIcon && (
              <HugeiconsIcon
                icon={display.tagIcon}
                strokeWidth={1.5}
                className={`size-3 ${display.tagColor ?? ''}`}
                aria-hidden
              />
            )}
            {display.tagLabel}
          </Badge>
        )}
        <span className="min-w-0 flex-1 truncate text-base font-semibold text-foreground">{display.name}</span>
        {display.purposeLabel && (
          <span className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] font-medium ${display.purposeCls}`}>
            {display.purposeLabel}
          </span>
        )}
        <NoteSheetButton
          targetKind="span"
          targetId={span.id}
          parentTraceId={span.traceId}
          parentSessionId={span.sessionId ?? null}
        />
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
        {span.model && <Stat label="Model" value={span.model} />}
        {span.provider && <Stat label="Provider" value={span.provider} />}
        {span.agentId && <Stat label="Agent id" value={span.agentId} />}
        {span.finishReasons && span.finishReasons.length > 0 && (
          <Stat label="Finish" value={span.finishReasons.join(', ')} />
        )}
        {span.responseId && <Stat label="Response id" value={span.responseId} />}
        {span.systemFingerprint && <Stat label="Fingerprint" value={span.systemFingerprint} />}
      </dl>

      {isChatSpan(span) && <SpanContextBreakdown span={span} />}

      {span.agentDescription && <RoleCard kind="agent" label="description" content={span.agentDescription} />}
      {systemPrompt && <RoleCard kind="system" label="system prompt" content={systemPrompt} />}

      {span.inputParams && <JsonBlock label="Input" raw={span.inputParams} />}
      {span.toolResult != null && <JsonBlock label="Result" value={span.toolResult} />}
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
  if (!ready) return null
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
        {spanLogs.map((log) => (
          <div key={log.id} className="flex items-start gap-2 px-2.5 py-1.5 text-[11px]">
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
      {inputMsgs.length > 0 && (
        <div className="flex min-w-0 flex-col gap-2">
          <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Input</div>
          {inputMsgs.map((msg, i) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: message positions are stable for a frozen span
            <MessageCard key={`in-${i}`} msg={msg} callResolutions={callResolutions} />
          ))}
        </div>
      )}
      {outputMsgs.length > 0 && (
        <div className="flex min-w-0 flex-col gap-2">
          <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Output</div>
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

const TOOL_CALL_TONES = {
  agent: {
    card: 'rounded-md bg-emerald-500/5 px-2 py-1.5 ring-1 ring-emerald-500/25 dark:bg-emerald-500/10 dark:ring-emerald-400/25',
    badge: 'rounded bg-emerald-500/15 px-1.5 py-0.5 text-[10px] font-medium text-emerald-700 dark:text-emerald-300',
    label: 'sub_agent',
  },
  tool: {
    card: 'rounded-md bg-sky-500/5 px-2 py-1.5 ring-1 ring-sky-500/20 dark:bg-sky-500/10 dark:ring-sky-400/20',
    badge: 'rounded bg-sky-500/15 px-1.5 py-0.5 text-[10px] font-medium text-sky-700 dark:text-sky-300',
    label: 'tool_call',
  },
} as const

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
    <Card size="sm" className="min-w-0 gap-2">
      <CardContent className="flex min-w-0 flex-col gap-2">
        <div className="flex items-center gap-2">
          <Badge variant={msg.role === 'assistant' ? 'secondary' : 'outline'} className="h-4 px-1.5 text-[10px]">
            {ROLE_LABELS[msg.role]}
          </Badge>
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
      </CardContent>
    </Card>
  )
}

function RoleCard({ kind, label, content }: { kind: RoleKey; label: string; content: string }) {
  return (
    <Card size="sm" className="min-w-0 gap-2">
      <CardContent className="flex min-w-0 flex-col gap-2">
        <div className="flex items-center gap-2">
          <Badge variant={kind === 'assistant' ? 'secondary' : 'outline'} className="h-4 px-1.5 text-[10px]">
            {ROLE_LABELS[kind]}
          </Badge>
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
    return <pre className="whitespace-pre-wrap break-words text-xs leading-relaxed text-foreground">{part.content}</pre>
  }
  if (part.kind === 'tool_call') {
    const resolved = callResolutions.get(part.id)
    const subAgent = resolved?.subAgent
    const subAgentName = subAgent?.agentName ?? subAgent?.name
    const tone = TOOL_CALL_TONES[subAgent ? 'agent' : 'tool']
    const hasResult = resolved?.result !== undefined
    const errored = resolved && !resolved.success
    return (
      <Collapsible className={`group min-w-0 overflow-hidden ${tone.card}`}>
        <CollapsibleTrigger className="flex w-full min-w-0 items-center gap-2 text-[11px]">
          <span className={`shrink-0 ${tone.badge}`}>{tone.label}</span>
          {/* biome-ignore lint/a11y/noStaticElementInteractions: stop drag-select inside the trigger from toggling the collapsible */}
          <span
            className="min-w-0 truncate font-mono text-foreground"
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
            className="ml-auto min-w-0 max-w-[12rem] shrink truncate font-mono text-[10px] text-muted-foreground"
            title={part.id}
            onMouseDown={(e) => e.stopPropagation()}
          >
            {part.id}
          </span>
          <HugeiconsIcon
            icon={ArrowDown01Icon}
            strokeWidth={2}
            className="size-3 shrink-0 text-muted-foreground transition-transform group-data-[state=open]:rotate-180"
          />
        </CollapsibleTrigger>
        <CollapsibleContent className="mt-2 min-w-0 space-y-3 data-[state=closed]:animate-out data-[state=open]:animate-in">
          {part.arguments != null && <ToolInput input={part.arguments} />}
          {hasResult &&
            (errored && typeof resolved.result === 'string' ? (
              <ToolOutput output={undefined} errorText={resolved.result} />
            ) : (
              <ToolOutput output={resolved.result} errorText={undefined} />
            ))}
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
          <span className="rounded bg-muted px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">{key}</span>
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
    return <pre className="whitespace-pre-wrap break-words text-xs leading-relaxed text-foreground">{content}</pre>
  }
  const preview = `${content.slice(0, 240).trimEnd()}…`
  return (
    <Collapsible open={open} onOpenChange={setOpen} className="min-w-0">
      <pre className="whitespace-pre-wrap break-words text-xs leading-relaxed text-foreground">
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

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <>
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="min-w-0 break-words tabular-nums text-foreground">{value}</dd>
    </>
  )
}

function JsonBlock({ label, value, raw }: { label: string; value?: unknown; raw?: string }) {
  return (
    <div className="min-w-0 max-w-full">
      <div className="mb-1 text-[11px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <JsonView value={raw ?? value} className="max-h-96" />
    </div>
  )
}
