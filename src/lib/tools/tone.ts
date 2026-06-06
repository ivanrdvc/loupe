import { Robot01Icon, Wrench01Icon } from '@hugeicons/core-free-icons'
import type { IconSvgElement } from '@hugeicons/react'

export type ToolKind = 'tool' | 'agent' | 'mcp'

export interface ToolTone {
  label: string
  icon: IconSvgElement
  text: string
  badge: string
  bg: string
  ring: string
  border: string
  selectedBorder: string
  hoverBg: string
}

const TOOL_TONES: Record<ToolKind, ToolTone> = {
  tool: {
    label: 'tool_call',
    icon: Wrench01Icon,
    text: 'text-sky-500 dark:text-sky-400',
    badge: 'bg-sky-500/15 text-sky-700 dark:text-sky-300',
    bg: 'bg-sky-500/5 dark:bg-sky-500/10',
    ring: 'ring-1 ring-sky-500/20 dark:ring-sky-400/20',
    border: 'border-sky-500/30 dark:border-sky-400/30',
    selectedBorder: 'border-sky-500/60 dark:border-sky-400/60',
    hoverBg: 'hover:bg-sky-500/5 dark:hover:bg-sky-400/5',
  },
  agent: {
    label: 'sub_agent',
    icon: Robot01Icon,
    text: 'text-emerald-500 dark:text-emerald-400',
    badge: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300',
    bg: 'bg-emerald-500/5 dark:bg-emerald-500/10',
    ring: 'ring-1 ring-emerald-500/25 dark:ring-emerald-400/25',
    border: 'border-emerald-500/30 dark:border-emerald-400/30',
    selectedBorder: 'border-emerald-500/60 dark:border-emerald-400/60',
    hoverBg: 'hover:bg-emerald-500/5 dark:hover:bg-emerald-400/5',
  },
  mcp: {
    label: 'mcp_call',
    icon: Wrench01Icon,
    text: 'text-sky-400 dark:text-sky-500',
    badge: 'bg-sky-400/15 text-sky-700 dark:text-sky-300',
    bg: 'bg-sky-400/5 dark:bg-sky-400/10',
    ring: 'ring-1 ring-sky-400/20 dark:ring-sky-400/20',
    border: 'border-sky-400/30 dark:border-sky-400/30',
    selectedBorder: 'border-sky-400/60 dark:border-sky-400/60',
    hoverBg: 'hover:bg-sky-400/5 dark:hover:bg-sky-400/5',
  },
}

export function toolTone(kind: ToolKind): ToolTone {
  return TOOL_TONES[kind]
}
