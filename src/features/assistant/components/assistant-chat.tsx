import { useChat } from '@ai-sdk/react'
import { DefaultChatTransport, isReasoningUIPart, isTextUIPart } from 'ai'
import { ListTree, Sparkles, ThumbsDown } from 'lucide-react'
import { useMemo, useRef, useState } from 'react'
import { Conversation, ConversationContent, ConversationScrollButton } from '#/components/ai-elements/conversation'
import {
  ModelSelector,
  ModelSelectorContent,
  ModelSelectorGroup,
  ModelSelectorItem,
  ModelSelectorList,
  ModelSelectorName,
  ModelSelectorTrigger,
} from '#/components/ai-elements/model-selector'
import {
  PromptInput,
  PromptInputBody,
  PromptInputFooter,
  type PromptInputMessage,
  PromptInputSubmit,
  PromptInputTextarea,
  PromptInputTools,
} from '#/components/ai-elements/prompt-input'
import { Shimmer } from '#/components/ai-elements/shimmer'
import { Button } from '#/components/ui/button.tsx'
import { cn } from '#/lib/utils'
import { CHAT_MODELS, type ChatModelId, DEFAULT_CHAT_MODEL, isChatModelId } from '../models'
import type { PageContext } from '../server/prompt'
import { AssistantMessage } from './assistant-message'

const MODEL_STORAGE_KEY = 'assistant-chat-model'

function suggestionsFor(ctx: PageContext) {
  if (ctx.traceId)
    return [
      { icon: Sparkles, text: 'Explain what is happening in this trace' },
      { icon: ListTree, text: 'Which span is the slowest, and why?' },
      { icon: ThumbsDown, text: 'Did anything error in this trace?' },
    ]
  if (ctx.sessionId)
    return [
      { icon: ThumbsDown, text: 'Was the user satisfied in this session?' },
      { icon: Sparkles, text: 'Summarize what the agent did this session' },
      { icon: ListTree, text: 'Break down token usage across the session' },
    ]
  return [
    { icon: Sparkles, text: 'What happened across my recent traces?' },
    { icon: ListTree, text: 'Which tools are the heaviest or failing most?' },
    { icon: ThumbsDown, text: 'Show me sessions that had errors' },
  ]
}

export function AssistantChat({ context }: { context: PageContext }) {
  const [input, setInput] = useState('')
  const [model, setModel] = useState<ChatModelId>(() => {
    if (typeof window === 'undefined') return DEFAULT_CHAT_MODEL
    const saved = window.localStorage.getItem(MODEL_STORAGE_KEY)
    return isChatModelId(saved) ? saved : DEFAULT_CHAT_MODEL
  })
  // Refs so the memoized transport always reads the latest values without being recreated.
  const modelRef = useRef(model)
  modelRef.current = model
  const contextRef = useRef(context)
  contextRef.current = context

  const transport = useMemo(
    () =>
      new DefaultChatTransport({
        api: '/api/chat',
        prepareSendMessagesRequest: ({ messages }) => ({
          body: { messages, model: modelRef.current, context: contextRef.current },
        }),
      }),
    [],
  )

  const { messages, sendMessage, status, stop, regenerate, error } = useChat({ transport })

  // Standalone "Thinking…" until the assistant emits a reasoning block or text.
  const last = messages.at(-1)
  const lastHasVisible =
    last?.role === 'assistant' &&
    last.parts.some((p) => (isTextUIPart(p) && p.text) || (isReasoningUIPart(p) && p.text))
  const awaitingText = (status === 'submitted' || status === 'streaming') && !lastHasVisible

  const pickModel = (id: ChatModelId) => {
    setModel(id)
    window.localStorage.setItem(MODEL_STORAGE_KEY, id)
  }

  const submit = (message: PromptInputMessage) => {
    const text = message.text?.trim()
    if (!text) return
    sendMessage({ text })
    setInput('')
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <Conversation initial="instant">
        <ConversationContent className="px-4">
          {messages.length === 0 ? (
            <EmptyState context={context} onPick={(text) => sendMessage({ text })} />
          ) : (
            messages.map((message, i) => (
              <AssistantMessage
                key={message.id}
                message={message}
                isLast={i === messages.length - 1}
                status={status}
                onRegenerate={regenerate}
              />
            ))
          )}
          {awaitingText && <Shimmer className="text-sm">Thinking…</Shimmer>}
        </ConversationContent>
        <ConversationScrollButton />
      </Conversation>

      <div className="shrink-0 px-3 pb-3">
        {error && (
          <div className="mb-2 flex items-center justify-between gap-3 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
            <span>{error.message || 'Something went wrong.'}</span>
            <button type="button" className="underline underline-offset-2" onClick={() => regenerate()}>
              Retry
            </button>
          </div>
        )}
        <PromptInput className="[&>div]:rounded-xl [&>div]:border [&>div]:bg-card" onSubmit={submit}>
          <PromptInputBody>
            <PromptInputTextarea
              className="min-h-14 px-3 pt-2.5 text-[13px] leading-relaxed"
              value={input}
              onChange={(e) => setInput(e.currentTarget.value)}
              placeholder="Ask the assistant — about this page, trace, or session"
            />
          </PromptInputBody>
          <PromptInputFooter className="px-2.5 pb-2.5">
            <PromptInputTools>
              <ComposerModelSelector model={model} onModelChange={pickModel} />
            </PromptInputTools>
            <PromptInputSubmit
              disabled={!input.trim() && status !== 'streaming' && status !== 'submitted'}
              onStop={stop}
              status={status}
            />
          </PromptInputFooter>
        </PromptInput>
      </div>
    </div>
  )
}

function EmptyState({ context, onPick }: { context: PageContext; onPick: (text: string) => void }) {
  return (
    <div className="flex min-h-full flex-col justify-end pb-4">
      <h2 className="text-lg font-semibold">Ask about your agents</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        I read your live telemetry — explain a trace, dig into a session, or surface slow or failing tools.
      </p>
      <div className="mt-4 flex flex-col gap-2">
        {suggestionsFor(context).map(({ icon: Icon, text }) => (
          <button
            key={text}
            type="button"
            onClick={() => onPick(text)}
            className="flex items-center gap-3 rounded-lg border bg-card px-3 py-2.5 text-left text-sm transition-colors hover:bg-accent"
          >
            <Icon className="size-4 shrink-0 text-primary" />
            <span className="min-w-0 truncate">{text}</span>
          </button>
        ))}
      </div>
    </div>
  )
}

function ComposerModelSelector({
  model,
  onModelChange,
}: {
  model: ChatModelId
  onModelChange: (id: ChatModelId) => void
}) {
  const [open, setOpen] = useState(false)
  const selected = CHAT_MODELS.find((m) => m.id === model)
  const providers = [...new Set(CHAT_MODELS.map((m) => m.provider))]
  return (
    <ModelSelector open={open} onOpenChange={setOpen}>
      <ModelSelectorTrigger asChild>
        <Button
          variant="ghost"
          className="h-7 max-w-[180px] justify-between gap-1.5 rounded-lg px-2 text-xs text-muted-foreground hover:text-foreground"
        >
          <ModelSelectorName>{selected?.label}</ModelSelectorName>
        </Button>
      </ModelSelectorTrigger>
      <ModelSelectorContent>
        <ModelSelectorList>
          {providers.map((provider) => (
            <ModelSelectorGroup key={provider} heading={provider}>
              {CHAT_MODELS.filter((m) => m.provider === provider).map((m) => (
                <ModelSelectorItem
                  key={m.id}
                  value={m.id}
                  onSelect={() => {
                    onModelChange(m.id)
                    setOpen(false)
                  }}
                  className={cn('flex w-full', m.id === model && 'bg-accent text-accent-foreground')}
                >
                  <ModelSelectorName>{m.label}</ModelSelectorName>
                </ModelSelectorItem>
              ))}
            </ModelSelectorGroup>
          ))}
        </ModelSelectorList>
      </ModelSelectorContent>
    </ModelSelector>
  )
}
