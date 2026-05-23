import { ArrowDown01Icon, Edit02Icon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'
import { useMemo, useState } from 'react'
import { toast } from 'sonner'
import { CodeBlock } from '#/components/ai-elements/code-block-lazy'
import { ToolInput, ToolOutput } from '#/components/ai-elements/tool'
import { Badge } from '#/components/ui/badge'
import { Button } from '#/components/ui/button'
import { Card, CardContent } from '#/components/ui/card'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '#/components/ui/collapsible'
import { asMessages, type ChatMessage, type MessagePart, type MessageRole } from '#/lib/conversation'
import { formatCost } from '#/lib/format'
import { formatJson, type JsonValue } from '#/lib/json'
import { queryKeys } from '#/lib/query-keys'
import { buildAgentLabels, resolveToolCalls, type Span, type ToolCallResolution } from '#/lib/spans'
import { NoteSheetButton } from '#/routes/notes/-components/note-sheet-button'
import { createPrompt } from '#/routes/prompts/-mock-data'
import type { Message as PromptMessage } from '#/routes/prompts/-types'
import { displayFor, fmtNum, formatDuration } from './shared'

function isLlmSpan(span: Span): boolean {
  if (span.operation === 'chat') return true
  if (span.llmInput != null || span.llmOutput != null) return true
  if (span.model) return true
  return false
}

function extractPromptMessages(span: Span): PromptMessage[] {
  const out: PromptMessage[] = []
  for (const msg of asMessages(span.llmInput)) {
    const text = msg.parts.find((p): p is Extract<MessagePart, { kind: 'text' }> => p.kind === 'text')?.content
    if (text) out.push({ role: msg.role, content: text })
  }
  return out
}

export function DetailPanel({ span, spans }: { span: Span; spans?: Span[] }) {
  const duration = span.endMs - span.startMs
  const agentLabels = useMemo(() => (spans ? buildAgentLabels(spans) : undefined), [spans])
  const display = displayFor(span, agentLabels)
  const navigate = useNavigate()
  const queryClient = useQueryClient()

  const importMutation = useMutation({
    mutationFn: async () => {
      const messages = extractPromptMessages(span)
      const promptName = `imported-from-${span.id.slice(0, 8)}`
      return createPrompt({
        name: promptName,
        description: `Imported from span ${span.id}`,
        initialMessages: messages.length > 0 ? messages : undefined,
        initialModel: span.model,
      })
    },
    onSuccess: async (prompt) => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.prompts.all() })
      const extractedAny = extractPromptMessages(span).length > 0
      toast.success(extractedAny ? 'Prompt created — opening editor' : 'Imported (no messages found in span)')
      void navigate({ to: '/prompts/$promptId', params: { promptId: prompt.id } })
    },
  })

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
        {isLlmSpan(span) && (
          <Button
            variant="outline"
            size="sm"
            onClick={() => importMutation.mutate()}
            disabled={importMutation.isPending}
          >
            <HugeiconsIcon icon={Edit02Icon} data-icon="inline-start" strokeWidth={2} />
            {importMutation.isPending ? 'Creating…' : 'Make prompt'}
          </Button>
        )}
      </div>

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

      {span.agentDescription && <AgentDescriptionCard content={span.agentDescription} />}

      {span.inputParams && <JsonBlock label="Input" raw={span.inputParams} />}
      {span.toolResult != null && <JsonBlock label="Result" value={span.toolResult} />}
      {(span.llmInput != null || span.llmOutput != null) && (
        <MessagesBlock input={span.llmInput} output={span.llmOutput} outputType={span.outputType} spans={spans} />
      )}
    </div>
  )
}

function MessagesBlock({
  input,
  output,
  outputType,
  spans,
}: {
  input?: JsonValue
  output?: JsonValue
  outputType?: string
  spans?: Span[]
}) {
  const inputMsgs = useMemo(() => asMessages(input), [input])
  const outputMsgs = useMemo(() => asMessages(output), [output])
  // Tool results live on the sibling execute_tool span — asMessages drops
  // tool-role messages — so we splice them back in keyed by tool_call id.
  const callResolutions = useMemo(() => (spans ? resolveToolCalls(spans) : new Map()), [spans])
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
          <SectionLabel>Input</SectionLabel>
          {inputMsgs.map((msg, i) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: message positions are stable for a frozen span
            <MessageCard key={`in-${i}`} msg={msg} callResolutions={callResolutions} />
          ))}
        </div>
      )}
      {outputMsgs.length > 0 && (
        <div className="flex min-w-0 flex-col gap-2">
          <SectionLabel>Output</SectionLabel>
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

function SectionLabel({ children }: { children: React.ReactNode }) {
  return <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{children}</div>
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
          <RoleChip kind={msg.role} />
          {isStructured && (
            <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
              structured · {structured}
            </span>
          )}
        </div>
        <div className="min-w-0 space-y-2">
          {msg.parts.map((part, i) => (
            <MessagePartView
              // biome-ignore lint/suspicious/noArrayIndexKey: part positions are stable for a frozen message
              key={i}
              part={part}
              structured={isStructured}
              role={msg.role}
              callResolutions={callResolutions}
            />
          ))}
        </div>
      </CardContent>
    </Card>
  )
}

function RoleChip({ kind }: { kind: RoleKey }) {
  return (
    <Badge variant={kind === 'assistant' ? 'secondary' : 'outline'} className="h-4 px-1.5 text-[10px]">
      {ROLE_LABELS[kind]}
    </Badge>
  )
}

function AgentDescriptionCard({ content }: { content: string }) {
  return (
    <Card size="sm" className="min-w-0 gap-2">
      <CardContent className="flex min-w-0 flex-col gap-2">
        <div className="flex items-center gap-2">
          <RoleChip kind="agent" />
          <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">description</span>
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
  return <CodeBlock code={formatJson(part.response)} language="json" />
}

function StructuredText({ content }: { content: string }) {
  const parsed = (() => {
    try {
      return JSON.parse(content) as unknown
    } catch {
      return undefined
    }
  })()
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
    return <CodeBlock code={formatJson(parsed)} language="json" />
  }
  return <pre className="whitespace-pre-wrap break-words text-xs leading-snug text-foreground">{content}</pre>
}

function CollapsibleText({ content, previewChars = 240 }: { content: string; previewChars?: number }) {
  const [open, setOpen] = useState(false)
  if (content.length <= previewChars) {
    return <pre className="whitespace-pre-wrap break-words text-xs leading-relaxed text-foreground">{content}</pre>
  }
  const preview = `${content.slice(0, previewChars).trimEnd()}…`
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

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <>
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="min-w-0 break-words tabular-nums text-foreground">{value}</dd>
    </>
  )
}

function JsonBlock({ label, value, raw }: { label: string; value?: unknown; raw?: string }) {
  const text =
    raw ??
    (() => {
      try {
        return JSON.stringify(value, null, 2)
      } catch {
        return String(value)
      }
    })()
  return (
    <div className="min-w-0 max-w-full">
      <div className="mb-1 text-[11px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <CodeBlock code={text} language="json" className="max-h-96" />
    </div>
  )
}
