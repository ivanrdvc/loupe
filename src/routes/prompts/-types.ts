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

export type FolderKind = 'user' | 'system'

export type PromptFolder = {
  id: number
  name: string
  parentId: number | null
  kind: FolderKind
  createdAt: number
  updatedAt: number
}

export type PromptVersion = {
  id: number
  promptId: number
  version: number
  messages: Message[]
  modelParams: ModelParams
  tools: Tool[]
  responseFormat: ResponseFormat
  author: string
  sourceRef: string | null
  createdAt: number
}

export type RunConfig = {
  endpointUrl?: string
  agentName?: string
}

export type Prompt = {
  id: number
  folderId: number | null
  name: string
  description: string | null
  runConfig: RunConfig | null
  tagIds: number[]
  createdAt: number
  updatedAt: number
}

export type Tag = {
  id: number
  name: string
  color: string
  createdAt: number
}

export type PromptWithVersions = {
  prompt: Prompt
  versions: PromptVersion[]
  folder: PromptFolder | null
}

export type CreatePromptInput = {
  folderId: number | null
  name: string
  description?: string | null
  initialMessages?: Message[]
  initialModelParams?: ModelParams
  author: string
}

export type CreateVersionInput = {
  promptId: number
  messages: Message[]
  modelParams: ModelParams
  tools: Tool[]
  responseFormat: ResponseFormat
  author: string
}

export type UpdatePromptMetaInput = {
  promptId: number
  name?: string
  description?: string | null
  folderId?: number | null
}

export type CreateFolderInput = {
  name: string
  parentId?: number | null
  kind?: FolderKind
}
