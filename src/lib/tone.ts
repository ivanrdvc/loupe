import { Bot, type LucideIcon, Wrench } from 'lucide-react'

// Single source of truth for accent colors. Components pick a semantic tone
// from here instead of hardcoding palette classes. Tailwind needs literal
// class strings, so every tier is written out per family.
// Tiers — badge: tinted pill · text: icons/tags · ident: emphasized
// identifiers (names, models, keys) · status: threshold/outcome text ·
// solid: filled dots/bars. Spec: docs/reference/tones.md

export type AccentFamily =
  | 'violet'
  | 'pink'
  | 'cyan'
  | 'emerald'
  | 'sky'
  | 'amber'
  | 'rose'
  | 'blue'
  | 'teal'
  | 'orange'
  | 'zinc'

export interface Accent {
  badge: string
  text: string
  ident: string
  status: string
  solid: string
}

export const ACCENT: Record<AccentFamily, Accent> = {
  violet: {
    badge: 'bg-violet-50 text-violet-600 dark:bg-violet-300/10 dark:text-violet-300',
    text: 'text-violet-500 dark:text-violet-400',
    ident: 'text-violet-700 dark:text-violet-400',
    status: 'text-violet-700 dark:text-violet-300',
    solid: 'bg-violet-400 dark:bg-violet-500',
  },
  pink: {
    badge: 'bg-pink-50 text-pink-600 dark:bg-pink-300/10 dark:text-pink-300',
    text: 'text-pink-500 dark:text-pink-400',
    ident: 'text-pink-700 dark:text-pink-400',
    status: 'text-pink-700 dark:text-pink-300',
    solid: 'bg-pink-400 dark:bg-pink-500',
  },
  cyan: {
    badge: 'bg-cyan-50 text-cyan-600 dark:bg-cyan-300/10 dark:text-cyan-300',
    text: 'text-cyan-500 dark:text-cyan-400',
    ident: 'text-cyan-700 dark:text-cyan-400',
    status: 'text-cyan-700 dark:text-cyan-300',
    solid: 'bg-cyan-400 dark:bg-cyan-500',
  },
  emerald: {
    badge: 'bg-emerald-50 text-emerald-600 dark:bg-emerald-300/10 dark:text-emerald-300',
    text: 'text-emerald-500 dark:text-emerald-400',
    ident: 'text-emerald-700 dark:text-emerald-400',
    status: 'text-emerald-700 dark:text-emerald-300',
    solid: 'bg-emerald-400 dark:bg-emerald-500',
  },
  sky: {
    badge: 'bg-sky-50 text-sky-600 dark:bg-sky-300/10 dark:text-sky-300',
    text: 'text-sky-500 dark:text-sky-400',
    ident: 'text-sky-700 dark:text-sky-400',
    status: 'text-sky-700 dark:text-sky-300',
    solid: 'bg-sky-400 dark:bg-sky-500',
  },
  amber: {
    badge: 'bg-amber-50 text-amber-600 dark:bg-amber-300/10 dark:text-amber-300',
    text: 'text-amber-500 dark:text-amber-400',
    ident: 'text-amber-700 dark:text-amber-400',
    status: 'text-amber-700 dark:text-amber-300',
    solid: 'bg-amber-400 dark:bg-amber-500',
  },
  rose: {
    badge: 'bg-rose-50 text-rose-600 dark:bg-rose-300/10 dark:text-rose-300',
    text: 'text-rose-500 dark:text-rose-400',
    ident: 'text-rose-700 dark:text-rose-400',
    status: 'text-rose-700 dark:text-rose-300',
    solid: 'bg-rose-400 dark:bg-rose-500',
  },
  blue: {
    badge: 'bg-blue-50 text-blue-600 dark:bg-blue-300/10 dark:text-blue-300',
    text: 'text-blue-500 dark:text-blue-400',
    ident: 'text-blue-700 dark:text-blue-400',
    status: 'text-blue-700 dark:text-blue-300',
    solid: 'bg-blue-400 dark:bg-blue-500',
  },
  teal: {
    badge: 'bg-teal-50 text-teal-600 dark:bg-teal-300/10 dark:text-teal-300',
    text: 'text-teal-500 dark:text-teal-400',
    ident: 'text-teal-700 dark:text-teal-400',
    status: 'text-teal-700 dark:text-teal-300',
    solid: 'bg-teal-400 dark:bg-teal-500',
  },
  orange: {
    badge: 'bg-orange-50 text-orange-600 dark:bg-orange-300/10 dark:text-orange-300',
    text: 'text-orange-500 dark:text-orange-400',
    ident: 'text-orange-700 dark:text-orange-400',
    status: 'text-orange-700 dark:text-orange-300',
    solid: 'bg-orange-400 dark:bg-orange-500',
  },
  zinc: {
    badge: 'bg-zinc-50 text-zinc-600 dark:bg-zinc-300/10 dark:text-zinc-300',
    text: 'text-zinc-500 dark:text-zinc-400',
    ident: 'text-zinc-700 dark:text-zinc-400',
    status: 'text-zinc-700 dark:text-zinc-300',
    solid: 'bg-zinc-400 dark:bg-zinc-500',
  },
}

export type ToolKind = 'tool' | 'agent' | 'mcp'

export interface ToolTone {
  label: string
  icon: LucideIcon
  text: string
  badge: string
  bg: string
  ring: string
  border: string
  selectedBorder: string
  hoverBg: string
}

const SKY_CHROME = {
  bg: 'bg-sky-500/5',
  ring: 'ring-1 ring-sky-500/25 dark:ring-sky-400/25',
  border: 'border-sky-500/30 dark:border-sky-400/30',
  selectedBorder: 'border-sky-500/60 dark:border-sky-400/60',
  hoverBg: 'hover:bg-sky-500/5 dark:hover:bg-sky-400/5',
}

const TOOL_TONES: Record<ToolKind, ToolTone> = {
  tool: { label: 'tool_call', icon: Wrench, text: ACCENT.sky.text, badge: ACCENT.sky.badge, ...SKY_CHROME },
  agent: {
    label: 'sub_agent',
    icon: Bot,
    text: ACCENT.emerald.text,
    badge: ACCENT.emerald.badge,
    bg: 'bg-emerald-500/5',
    ring: 'ring-1 ring-emerald-500/25 dark:ring-emerald-400/25',
    border: 'border-emerald-500/30 dark:border-emerald-400/30',
    selectedBorder: 'border-emerald-500/60 dark:border-emerald-400/60',
    hoverBg: 'hover:bg-emerald-500/5 dark:hover:bg-emerald-400/5',
  },
  mcp: { label: 'mcp_call', icon: Wrench, text: ACCENT.sky.text, badge: ACCENT.sky.badge, ...SKY_CHROME },
}

export function toolTone(kind: ToolKind): ToolTone {
  return TOOL_TONES[kind]
}
