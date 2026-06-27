import { useNavigate } from '@tanstack/react-router'
import { type ChatStatus, isReasoningUIPart, isTextUIPart, type UIMessage } from 'ai'
import { Copy, RefreshCcw } from 'lucide-react'
import type { ComponentProps } from 'react'
import {
  Message,
  MessageAction,
  MessageActions,
  MessageContent,
  MessageResponse,
} from '#/components/ai-elements/message'
import { Reasoning, ReasoningContent, ReasoningTrigger } from '#/components/ai-elements/reasoning'

function messageText(message: UIMessage): string {
  return message.parts
    .filter(isTextUIPart)
    .map((p) => p.text)
    .join('\n\n')
}

// Streamdown forces target="_blank"; route the agent's ?trace=/?session= links to the drawer instead.
function AgentLink({ href, children, ...props }: ComponentProps<'a'>) {
  const navigate = useNavigate()
  const url = href && typeof window !== 'undefined' ? new URL(href, window.location.href) : null
  const inApp =
    url != null &&
    url.origin === window.location.origin &&
    (url.searchParams.has('trace') || url.searchParams.has('session'))
  if (!inApp) {
    return (
      <a {...props} href={href} target="_blank" rel="noreferrer">
        {children}
      </a>
    )
  }
  return (
    <a
      {...props}
      href={href}
      onClick={(e) => {
        if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return
        e.preventDefault()
        const params = Object.fromEntries(url.searchParams)
        void navigate({
          to: '.',
          search: (prev) => ({ ...prev, trace: undefined, session: undefined, span: undefined, ...params }),
        })
      }}
    >
      {children}
    </a>
  )
}

const responseComponents = { a: AgentLink }

const actionsClassName = 'opacity-0 transition-opacity group-focus-within:opacity-100 group-hover:opacity-100'

export function AgentMessage({
  message,
  isLast,
  status,
  onRegenerate,
}: {
  message: UIMessage
  isLast: boolean
  status: ChatStatus
  onRegenerate: () => void
}) {
  const isGenerating = isLast && (status === 'streaming' || status === 'submitted')

  const reasoning = message.parts
    .filter(isReasoningUIPart)
    .map((p) => p.text)
    .join('\n\n')
    .trim()
  const text = messageText(message)
  if (!text && !reasoning) return null

  return (
    <Message from={message.role}>
      <MessageContent className="text-[13px] leading-[1.6]">
        {reasoning && (
          <Reasoning className="w-full" isStreaming={isGenerating && !text}>
            <ReasoningTrigger />
            <ReasoningContent>{reasoning}</ReasoningContent>
          </Reasoning>
        )}
        {text && (
          <MessageResponse linkSafety={{ enabled: false }} components={responseComponents}>
            {text}
          </MessageResponse>
        )}
      </MessageContent>

      {message.role === 'assistant' && !isGenerating && (
        <MessageActions className={actionsClassName}>
          {isLast && (
            <MessageAction label="Retry" onClick={() => onRegenerate()} tooltip="Retry">
              <RefreshCcw className="size-3" />
            </MessageAction>
          )}
          <MessageAction
            label="Copy"
            onClick={() => navigator.clipboard.writeText(messageText(message))}
            tooltip="Copy"
          >
            <Copy className="size-3" />
          </MessageAction>
        </MessageActions>
      )}
    </Message>
  )
}
