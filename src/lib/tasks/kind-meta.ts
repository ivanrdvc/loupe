import { Clock01Icon, Notification03Icon, RepeatIcon, Time04Icon, WebhookIcon } from '@hugeicons/core-free-icons'
import type { IconSvgElement } from '@hugeicons/react'
import type { TaskKind } from '#/lib/tasks/rollup'

export interface KindMeta {
  label: string
  icon: IconSvgElement
  color: string
}

export const KIND_META: Record<TaskKind, KindMeta> = {
  cron: { label: 'Cron', icon: Clock01Icon, color: 'text-amber-500 dark:text-amber-400' },
  one_shot: { label: 'One-shot', icon: Time04Icon, color: 'text-amber-500 dark:text-amber-400' },
  event: { label: 'Event', icon: Notification03Icon, color: 'text-orange-500 dark:text-orange-400' },
  webhook: { label: 'Webhook', icon: WebhookIcon, color: 'text-cyan-500 dark:text-cyan-400' },
  background: { label: 'Background', icon: RepeatIcon, color: 'text-violet-500 dark:text-violet-400' },
  unknown: { label: 'Task', icon: RepeatIcon, color: 'text-zinc-400 dark:text-zinc-500' },
}
