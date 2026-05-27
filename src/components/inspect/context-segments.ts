export const SEGMENT_COLORS = {
  system: 'bg-muted-foreground/60',
  tools: 'bg-indigo-300 dark:bg-indigo-400',
  messages: 'bg-orange-300 dark:bg-orange-400',
  subagents: 'bg-sky-300 dark:bg-sky-400',
} as const

type ContextSegmentKey = keyof typeof SEGMENT_COLORS

export interface ContextSegment {
  key: ContextSegmentKey
  label: string
  tokens: number
  pct: number
}

export function computeContextSegments(input: {
  systemTokens: number
  toolDefsTokens: number
  messagesTokens: number
  subagentTokens: number
}): ContextSegment[] {
  const raw = [
    { key: 'system' as const, label: 'System', tokens: input.systemTokens },
    { key: 'tools' as const, label: 'Tool defs', tokens: input.toolDefsTokens },
    { key: 'messages' as const, label: 'Messages', tokens: input.messagesTokens },
    { key: 'subagents' as const, label: 'Subagents', tokens: input.subagentTokens },
  ]
  const denom = raw.reduce((acc, s) => acc + s.tokens, 0) || 1
  return raw.map((s) => ({ ...s, pct: s.tokens > 0 ? Math.round((s.tokens / denom) * 100) : 0 }))
}
