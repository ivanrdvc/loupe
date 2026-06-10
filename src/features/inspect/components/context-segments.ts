export const SEGMENT_COLORS = {
  system: 'bg-muted-foreground/60',
  tools: 'bg-violet-400 dark:bg-violet-500',
  messages: 'bg-pink-400 dark:bg-pink-500',
  subagents: 'bg-cyan-400 dark:bg-cyan-500',
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
