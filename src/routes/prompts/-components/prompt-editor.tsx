import { Add01Icon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { Button } from '#/components/ui/button'
import type { Message } from '../-types'
import { MessageCard } from './message-card'

export function PromptEditor({
  messages,
  onChange,
  disabled,
}: {
  messages: Message[]
  onChange: (next: Message[]) => void
  disabled?: boolean
}) {
  const updateAt = (idx: number, next: Message) => {
    const copy = [...messages]
    copy[idx] = next
    onChange(copy)
  }

  const deleteAt = (idx: number) => {
    const copy = messages.filter((_, i) => i !== idx)
    onChange(copy)
  }

  const addMessage = () => {
    const last = messages[messages.length - 1]
    const role = last?.role === 'user' ? 'assistant' : 'user'
    onChange([...messages, { role, content: '' }])
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
            onChange={(next) => updateAt(idx, next)}
            onDelete={() => deleteAt(idx)}
          />
        ))
      )}
      <div>
        <Button variant="outline" size="sm" onClick={addMessage} disabled={disabled}>
          <HugeiconsIcon icon={Add01Icon} data-icon="inline-start" />
          Add message
        </Button>
      </div>
    </div>
  )
}
