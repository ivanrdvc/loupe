import { Add01Icon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { Button } from '#/components/ui/button'
import type { Message } from '#/features/inventory/system-prompts/types'
import { MessageCard } from './message-card'

export function PromptEditor({
  messages,
  onChange,
  readOnly,
}: {
  messages: Message[]
  onChange?: (next: Message[]) => void
  readOnly?: boolean
}) {
  const updateAt = (idx: number, next: Message) => {
    if (!onChange) return
    const copy = [...messages]
    copy[idx] = next
    onChange(copy)
  }

  const deleteAt = (idx: number) => {
    if (!onChange) return
    onChange(messages.filter((_, i) => i !== idx))
  }

  const addMessage = () => {
    if (!onChange) return
    const last = messages[messages.length - 1]
    const role = last?.role === 'user' ? 'assistant' : 'user'
    onChange([...messages, { role, content: '' }])
  }

  if (messages.length === 0 && readOnly) {
    return (
      <div className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
        No messages in this version.
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-3">
      {messages.length === 0 ? (
        <div className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
          No messages. Add one to get started.
        </div>
      ) : (
        messages.map((message, idx) => (
          <MessageCard
            // biome-ignore lint/suspicious/noArrayIndexKey: positional editing — messages have no stable id
            key={idx}
            index={idx}
            message={message}
            onChange={readOnly ? undefined : (next) => updateAt(idx, next)}
            onDelete={readOnly ? undefined : () => deleteAt(idx)}
            readOnly={readOnly}
          />
        ))
      )}
      {!readOnly && (
        <div>
          <Button variant="outline" size="sm" onClick={addMessage}>
            <HugeiconsIcon icon={Add01Icon} data-icon="inline-start" />
            Add message
          </Button>
        </div>
      )}
    </div>
  )
}
