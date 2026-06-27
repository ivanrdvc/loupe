import { useChat } from '@ai-sdk/react'
import { useNavigate } from '@tanstack/react-router'
import { DefaultChatTransport, isReasoningUIPart, isTextUIPart } from 'ai'
import { AlertTriangle, Coins, Route, Sparkles, Timer } from 'lucide-react'
import { useCallback, useRef, useState, useSyncExternalStore } from 'react'
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
import { createLocalStorageStore } from '#/lib/local-storage-store'
import { cn } from '#/lib/utils'
import { CHAT_MODELS, type ChatModelId, DEFAULT_CHAT_MODEL, isChatModelId } from '../chat-models'
import type { MentionRef, PageContext } from '../server/prompt'
import { MentionBackdrop, useMentionPicker } from './agent-mention'
import { AgentMessage } from './agent-message'

const MODEL_KEY = 'agent-chat-model'
const modelStore = createLocalStorageStore(MODEL_KEY)
const readModel = (): ChatModelId => {
  const v = typeof window === 'undefined' ? null : window.localStorage.getItem(MODEL_KEY)
  return isChatModelId(v) ? v : DEFAULT_CHAT_MODEL
}

function useChatModel(): [ChatModelId, (id: ChatModelId) => void] {
  const model = useSyncExternalStore(modelStore.subscribe, readModel, () => DEFAULT_CHAT_MODEL)
  const setModel = useCallback((id: ChatModelId) => {
    window.localStorage.setItem(MODEL_KEY, id)
    modelStore.notify()
  }, [])
  return [model, setModel]
}

function suggestionsFor(ctx: PageContext) {
  if (ctx.traceId)
    return [
      { icon: AlertTriangle, text: 'Why did this trace fail?' },
      { icon: Route, text: 'Walk me through what happened' },
      { icon: Timer, text: 'What was the slowest step, and why?' },
    ]
  if (ctx.sessionId)
    return [
      { icon: Sparkles, text: 'Summarize this session' },
      { icon: AlertTriangle, text: 'What errored, and why?' },
      { icon: Coins, text: 'Where did the tokens and cost go?' },
    ]
  return [
    { icon: Route, text: 'Walk me through my latest run' },
    { icon: AlertTriangle, text: 'What failed in the last hour?' },
  ]
}

export function AgentChat({ context }: { context: PageContext }) {
  const navigate = useNavigate()
  const [input, setInput] = useState('')
  const [model, setModel] = useChatModel()
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const backdropRef = useRef<HTMLDivElement>(null)
  const picker = useMentionPicker(input, setInput, textareaRef)

  // Per vercel/ai-chatbot use-active-chat.tsx: the transport reads the latest
  // model/context from a ref inside prepareSendMessagesRequest.
  const live = useRef({ model, context })
  live.current = { model, context }
  // The @-mentions for the message being sent; set at submit, then consumed
  // (and cleared) inside prepareSendMessagesRequest — which runs async, so it
  // must do the clearing, not submit().
  const pendingMentions = useRef<MentionRef[]>([])
  const { messages, sendMessage, status, stop, regenerate, error } = useChat({
    transport: new DefaultChatTransport({
      api: '/api/chat',
      prepareSendMessagesRequest: ({ messages, id }) => {
        const mentions = pendingMentions.current
        pendingMentions.current = []
        return { body: { messages, conversationId: id, mentions, ...live.current } }
      },
    }),
  })

  const isBusy = status === 'streaming' || status === 'submitted'
  // Standalone "Thinking…" until the agent emits a reasoning block or text.
  const last = messages.at(-1)
  const lastHasVisible =
    last?.role === 'assistant' &&
    last.parts.some((p) => (isTextUIPart(p) && p.text) || (isReasoningUIPart(p) && p.text))
  const awaitingText = isBusy && !lastHasVisible

  const submit = (message: PromptInputMessage) => {
    const text = message.text?.trim()
    if (!text) return
    pendingMentions.current = picker.selected
    sendMessage({ text })
    setInput('')
    picker.reset()
  }

  // Intercept the model's ?trace=/?session= deep-links so they open the
  // inspector via the router instead of a full-page navigation.
  const onLinkClick = (e: React.MouseEvent) => {
    // Let the browser handle modifier/non-primary clicks (open in new tab/window).
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return
    const anchor = (e.target as HTMLElement).closest('a')
    if (!anchor || (anchor.target && anchor.target !== '_self')) return
    const url = new URL(anchor.href, window.location.href)
    if (url.origin !== window.location.origin) return
    if (!url.searchParams.has('trace') && !url.searchParams.has('session')) return
    e.preventDefault()
    const params = Object.fromEntries(url.searchParams)
    // Replace the inspector params wholesale so a stale span/trace/session from
    // a prior link doesn't ride along into the new target.
    void navigate({
      to: '.',
      search: (prev) => ({ ...prev, trace: undefined, session: undefined, span: undefined, ...params }),
    })
  }

  return (
    // biome-ignore lint/a11y/useKeyWithClickEvents: delegated link interception, not a control
    // biome-ignore lint/a11y/noStaticElementInteractions: delegated link interception, not a control
    <div className="flex min-h-0 flex-1 flex-col" onClick={onLinkClick}>
      <Conversation initial="instant">
        <ConversationContent className="px-4">
          {messages.length === 0 ? (
            <EmptyState context={context} onPick={(text) => sendMessage({ text })} />
          ) : (
            messages.map((message, i) => (
              <AgentMessage
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

      <div className="relative shrink-0 px-3 pb-3">
        {error && (
          <div className="mb-2 flex items-center justify-between gap-3 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
            <span>{error.message || 'Something went wrong.'}</span>
            <button type="button" className="underline underline-offset-2" onClick={() => regenerate()}>
              Retry
            </button>
          </div>
        )}
        {picker.menu}
        <PromptInput className="[&>div]:rounded-xl [&>div]:border [&>div]:bg-card" onSubmit={submit}>
          <PromptInputBody>
            <div className="relative w-full">
              <MentionBackdrop
                ref={backdropRef}
                value={input}
                tokens={picker.tokens}
                className="px-3 pt-2.5 pb-2 text-[13px] leading-relaxed"
              />
              <PromptInputTextarea
                ref={textareaRef}
                className="relative min-h-14 bg-transparent px-3 pt-2.5 text-[13px] leading-relaxed dark:bg-transparent"
                value={input}
                onChange={picker.handleChange}
                onKeyDown={picker.handleKeyDown}
                onScroll={(e) => {
                  if (backdropRef.current) backdropRef.current.scrollTop = e.currentTarget.scrollTop
                }}
                placeholder="Ask the agent — @ to reference a session or trace"
              />
            </div>
          </PromptInputBody>
          <PromptInputFooter className="px-2.5 pb-2.5">
            <PromptInputTools>
              <ComposerModelSelector model={model} onModelChange={setModel} />
            </PromptInputTools>
            <PromptInputSubmit disabled={!input.trim() && !isBusy} onStop={stop} status={status} />
          </PromptInputFooter>
        </PromptInput>
      </div>
    </div>
  )
}

function EmptyState({ context, onPick }: { context: PageContext; onPick: (text: string) => void }) {
  return (
    <div className="flex min-h-full flex-col justify-end pb-4">
      <Shimmer as="h2" className="text-lg font-semibold" duration={1.4} repeat={0}>
        Ask about your agents
      </Shimmer>
      <Shimmer as="p" className="mt-1 text-sm" duration={1.4} repeat={0}>
        I read your live telemetry — explain a trace, dig into a session, or surface slow or failing tools.
      </Shimmer>
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
