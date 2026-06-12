import { Bell, Bot, Clock, Clock4, type LucideIcon, MessageSquare, Repeat, Unlink, Webhook, Wrench } from 'lucide-react'
import { ACCENT } from '#/lib/tone'
import { cn } from '#/lib/utils'

export type Kind =
  | 'chat'
  | 'sub-agent'
  | 'scheduled'
  | 'event'
  | 'webhook'
  | 'background'
  | 'utility'
  | 'orphan'
  | 'cron'
  | 'one_shot'
  | 'unknown'

export const KIND_META: Record<Kind, { label: string; icon: LucideIcon; badge: string; text: string }> = {
  chat: { label: 'Chat', icon: MessageSquare, badge: ACCENT.blue.badge, text: ACCENT.blue.text },
  'sub-agent': { label: 'Sub-agent', icon: Bot, badge: ACCENT.pink.badge, text: ACCENT.pink.text },
  scheduled: { label: 'Scheduled', icon: Clock, badge: ACCENT.amber.badge, text: ACCENT.amber.text },
  event: { label: 'Event', icon: Bell, badge: ACCENT.orange.badge, text: ACCENT.orange.text },
  webhook: { label: 'Webhook', icon: Webhook, badge: ACCENT.cyan.badge, text: ACCENT.cyan.text },
  background: { label: 'Background', icon: Repeat, badge: ACCENT.violet.badge, text: ACCENT.violet.text },
  utility: { label: 'Utility', icon: Wrench, badge: ACCENT.teal.badge, text: ACCENT.teal.text },
  orphan: { label: 'Orphan', icon: Unlink, badge: ACCENT.zinc.badge, text: ACCENT.zinc.text },
  cron: { label: 'Cron', icon: Clock, badge: ACCENT.amber.badge, text: ACCENT.amber.text },
  one_shot: { label: 'One-shot', icon: Clock4, badge: ACCENT.amber.badge, text: ACCENT.amber.text },
  unknown: { label: 'Task', icon: Repeat, badge: ACCENT.zinc.badge, text: ACCENT.zinc.text },
}

export function KindBadge({ kind, className }: { kind: Kind; className?: string }) {
  const meta = KIND_META[kind]
  return (
    <span
      className={cn(
        'inline-flex min-w-0 shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium',
        meta.badge,
        className,
      )}
    >
      <meta.icon className="size-3.5" />
      <span className="truncate">{meta.label}</span>
    </span>
  )
}
