export type MessageRole = 'system' | 'user' | 'assistant'

export type Message = { role: MessageRole; content: string }

export type Tool = {
  name: string
  description: string
  parameters: string
}

export type ResponseFormat = { type: 'text' } | { type: 'json_object' } | { type: 'json_schema'; schema: string }

export type ModelParams = {
  model: string
  temperature?: number
  maxTokens?: number
  topP?: number
}

export type PromptVersion = {
  id: string
  version: number
  messages: Message[]
  modelParams: ModelParams
  tools: Tool[]
  responseFormat: ResponseFormat
  createdAt: number
  author: string
}

export type Prompt = {
  id: string
  name: string
  description: string
  versions: PromptVersion[]
  createdAt: number
  updatedAt: number
}

export type CreatePromptInput = {
  name: string
  description: string
  initialMessages?: Message[]
  initialModel?: string
}

export type SaveVersionInput = Omit<PromptVersion, 'id' | 'version' | 'createdAt' | 'author'> & {
  author?: string
}

export type PromptRun = {
  id: string
  promptId: string
  versionId: string
  versionNumber: number
  varValues: Record<string, string>
  output: string
  durationMs: number
  createdAt: number
}
