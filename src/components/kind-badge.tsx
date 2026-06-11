import {
  Clock01Icon,
  Message01Icon,
  Notification03Icon,
  RepeatIcon,
  Robot01Icon,
  Time04Icon,
  Unlink01Icon,
  WebhookIcon,
  Wrench01Icon,
} from '@hugeicons/core-free-icons'
import { HugeiconsIcon, type IconSvgElement } from '@hugeicons/react'
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

export const KIND_META: Record<Kind, { label: string; icon: IconSvgElement; badge: string; text: string }> = {
  chat: {
    label: 'Chat',
    icon: Message01Icon,
    badge: 'bg-blue-50 text-blue-600 dark:bg-blue-300/10 dark:text-blue-300',
    text: 'text-blue-500 dark:text-blue-400',
  },
  'sub-agent': {
    label: 'Sub-agent',
    icon: Robot01Icon,
    badge: 'bg-pink-50 text-pink-600 dark:bg-pink-300/10 dark:text-pink-300',
    text: 'text-pink-500 dark:text-pink-400',
  },
  scheduled: {
    label: 'Scheduled',
    icon: Clock01Icon,
    badge: 'bg-amber-50 text-amber-600 dark:bg-amber-300/10 dark:text-amber-300',
    text: 'text-amber-500 dark:text-amber-400',
  },
  event: {
    label: 'Event',
    icon: Notification03Icon,
    badge: 'bg-orange-50 text-orange-600 dark:bg-orange-300/10 dark:text-orange-300',
    text: 'text-orange-500 dark:text-orange-400',
  },
  webhook: {
    label: 'Webhook',
    icon: WebhookIcon,
    badge: 'bg-cyan-50 text-cyan-600 dark:bg-cyan-300/10 dark:text-cyan-300',
    text: 'text-cyan-500 dark:text-cyan-400',
  },
  background: {
    label: 'Background',
    icon: RepeatIcon,
    badge: 'bg-violet-50 text-violet-600 dark:bg-violet-300/10 dark:text-violet-300',
    text: 'text-violet-500 dark:text-violet-400',
  },
  utility: {
    label: 'Utility',
    icon: Wrench01Icon,
    badge: 'bg-teal-50 text-teal-600 dark:bg-teal-300/10 dark:text-teal-300',
    text: 'text-teal-500 dark:text-teal-400',
  },
  orphan: {
    label: 'Orphan',
    icon: Unlink01Icon,
    badge: 'bg-zinc-50 text-zinc-600 dark:bg-zinc-300/10 dark:text-zinc-300',
    text: 'text-zinc-400 dark:text-zinc-500',
  },
  cron: {
    label: 'Cron',
    icon: Clock01Icon,
    badge: 'bg-amber-50 text-amber-600 dark:bg-amber-300/10 dark:text-amber-300',
    text: 'text-amber-500 dark:text-amber-400',
  },
  one_shot: {
    label: 'One-shot',
    icon: Time04Icon,
    badge: 'bg-amber-50 text-amber-600 dark:bg-amber-300/10 dark:text-amber-300',
    text: 'text-amber-500 dark:text-amber-400',
  },
  unknown: {
    label: 'Task',
    icon: RepeatIcon,
    badge: 'bg-zinc-50 text-zinc-600 dark:bg-zinc-300/10 dark:text-zinc-300',
    text: 'text-zinc-400 dark:text-zinc-500',
  },
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
      <HugeiconsIcon icon={meta.icon} className="size-3.5" />
      <span className="truncate">{meta.label}</span>
    </span>
  )
}
