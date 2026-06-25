import type { ChatStatus, UIMessage } from 'ai'
import { Copy, RefreshCcw } from 'lucide-react'
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
    .filter((p) => p.type === 'text')
    .map((p) => (p as { text: string }).text)
    .join('\n\n')
}

const actionsClassName = 'opacity-0 transition-opacity group-focus-within:opacity-100 group-hover:opacity-100'

export function AssistantMessage({
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

  // Tool-call cards aren't rendered (tools still run server-side); reasoning is one block.
  const reasoning = message.parts
    .filter((p) => p.type === 'reasoning')
    .map((p) => (p as { text: string }).text)
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
        {text && <MessageResponse>{text}</MessageResponse>}
      </MessageContent>

      {message.role === 'assistant' && !isGenerating && (
        <MessageActions className={actionsClassName}>
          {isLast && (
            <MessageAction label="Retry" onClick={onRegenerate} tooltip="Retry">
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
