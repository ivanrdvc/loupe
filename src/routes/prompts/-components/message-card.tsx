import { Delete02Icon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { Button } from '#/components/ui/button'
import { Card, CardContent, CardHeader } from '#/components/ui/card'
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from '#/components/ui/select'
import { Textarea } from '#/components/ui/textarea'
import type { Message, MessageRole } from '../-types'

const ROLES: MessageRole[] = ['system', 'user', 'assistant']

export function MessageCard({
  message,
  index,
  onChange,
  onDelete,
}: {
  message: Message
  index: number
  onChange: (next: Message) => void
  onDelete: () => void
}) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-2 pb-2">
        <Select value={message.role} onValueChange={(value) => onChange({ ...message, role: value as MessageRole })}>
          <SelectTrigger size="sm" className="w-32">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectGroup>
              {ROLES.map((role) => (
                <SelectItem key={role} value={role}>
                  {role}
                </SelectItem>
              ))}
            </SelectGroup>
          </SelectContent>
        </Select>
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={onDelete}
          aria-label={`Delete message ${index + 1}`}
          title="Delete message"
        >
          <HugeiconsIcon icon={Delete02Icon} strokeWidth={2} />
        </Button>
      </CardHeader>
      <CardContent>
        <Textarea
          value={message.content}
          onChange={(e) => onChange({ ...message, content: e.target.value })}
          placeholder={message.role === 'system' ? 'System instruction…' : 'Message content…'}
          className="font-mono text-xs"
        />
      </CardContent>
    </Card>
  )
}
