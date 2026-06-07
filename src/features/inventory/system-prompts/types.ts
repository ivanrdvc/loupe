export type SystemPromptEntity = {
  id: number
  name: string
  namespace: string
  systemPrompt: string | null
  description: string | null
  firstSeenAt: number
  lastSeenAt: number
}

export type SystemPromptVersion = {
  id: number
  value: string
  observedAt: number
  traceId: string | null
}

export type SystemPromptDetail = {
  entity: SystemPromptEntity
  versions: SystemPromptVersion[]
}
