import type {
  CreatePromptInput,
  Message,
  ModelParams,
  Prompt,
  PromptRun,
  PromptVersion,
  SaveVersionInput,
} from './-types'

const DELAY_MS = 80

function delay<T>(value: T): Promise<T> {
  return new Promise((resolve) => setTimeout(() => resolve(value), DELAY_MS))
}

function randomId(prefix: string): string {
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}`
}

const now = Date.now()
const DAY = 24 * 60 * 60 * 1000

function makeVersion(
  version: number,
  createdAt: number,
  overrides: Partial<Omit<PromptVersion, 'id' | 'version' | 'createdAt'>> = {},
): PromptVersion {
  return {
    id: randomId('v'),
    version,
    createdAt,
    author: 'ivan',
    messages: overrides.messages ?? [{ role: 'system', content: 'You are a helpful assistant.' }],
    modelParams: overrides.modelParams ?? { model: 'gpt-4o-mini', temperature: 0.7 },
    tools: overrides.tools ?? [],
    responseFormat: overrides.responseFormat ?? { type: 'text' },
  }
}

const prompts: Prompt[] = [
  {
    id: 'p_greeter',
    name: 'greeter-system',
    description: 'System prompt for the customer-facing greeter agent.',
    createdAt: now - 14 * DAY,
    updatedAt: now - 2 * DAY,
    versions: [
      makeVersion(1, now - 14 * DAY, {
        messages: [{ role: 'system', content: 'You are a friendly greeter. Say hi.' }],
        modelParams: { model: 'gpt-4o-mini', temperature: 0.7, maxTokens: 200 },
      }),
      makeVersion(2, now - 7 * DAY, {
        messages: [
          {
            role: 'system',
            content: 'You are a friendly greeter for {{company}}. Greet the user by name when known.',
          },
        ],
        modelParams: { model: 'gpt-4o-mini', temperature: 0.6, maxTokens: 200 },
      }),
      makeVersion(3, now - 2 * DAY, {
        messages: [
          {
            role: 'system',
            content:
              'You are a warm, concise greeter for {{company}}. Greet {{user_name}} by name when known. Keep it under two sentences.',
          },
        ],
        modelParams: { model: 'gpt-4o', temperature: 0.5, maxTokens: 250 },
      }),
    ],
  },
  {
    id: 'p_reviewer',
    name: 'reviewer-judge',
    description: 'LLM-judge prompt that scores agent outputs against a rubric.',
    createdAt: now - 30 * DAY,
    updatedAt: now - 12 * 60 * 60 * 1000,
    versions: [
      makeVersion(1, now - 30 * DAY, {
        messages: [{ role: 'system', content: 'Score the output 1-5. Output JSON: {"score": n}.' }],
        modelParams: { model: 'gpt-4o-mini', temperature: 0 },
        responseFormat: { type: 'json_object' },
      }),
      makeVersion(2, now - 25 * DAY, {
        messages: [
          { role: 'system', content: 'You are a strict reviewer. Score the output 1-5.' },
          { role: 'user', content: 'Output to score:\n{{output}}' },
        ],
        modelParams: { model: 'gpt-4o-mini', temperature: 0 },
        responseFormat: { type: 'json_object' },
      }),
      makeVersion(3, now - 20 * DAY, {
        messages: [
          { role: 'system', content: 'You are a strict reviewer scoring against rubric {{rubric}}.' },
          { role: 'user', content: 'Output to score:\n{{output}}' },
        ],
        modelParams: { model: 'gpt-4o', temperature: 0 },
        responseFormat: { type: 'json_object' },
      }),
      makeVersion(4, now - 15 * DAY, {
        messages: [
          { role: 'system', content: 'You are a strict reviewer scoring against rubric {{rubric}}.' },
          { role: 'user', content: 'Output to score:\n{{output}}\n\nReturn a JSON object with score and reasoning.' },
        ],
        modelParams: { model: 'gpt-4o', temperature: 0 },
        responseFormat: { type: 'json_object' },
      }),
      makeVersion(5, now - 10 * DAY, {
        messages: [
          {
            role: 'system',
            content: 'You are a strict reviewer scoring outputs 1-5 against rubric:\n{{rubric}}\n\nBe concise.',
          },
          { role: 'user', content: 'Output to score:\n{{output}}' },
        ],
        modelParams: { model: 'claude-sonnet-4-6', temperature: 0 },
        responseFormat: {
          type: 'json_schema',
          schema: JSON.stringify(
            {
              type: 'object',
              properties: {
                score: { type: 'integer', minimum: 1, maximum: 5 },
                reasoning: { type: 'string' },
              },
              required: ['score', 'reasoning'],
            },
            null,
            2,
          ),
        },
      }),
      makeVersion(6, now - 4 * DAY, {
        messages: [
          {
            role: 'system',
            content:
              'You are a senior reviewer. Score 1-5 against:\n{{rubric}}\n\nReturn {"score","reasoning"}. No prose.',
          },
          { role: 'user', content: 'Output:\n{{output}}' },
        ],
        modelParams: { model: 'claude-sonnet-4-6', temperature: 0, maxTokens: 800 },
        responseFormat: {
          type: 'json_schema',
          schema: JSON.stringify(
            {
              type: 'object',
              properties: {
                score: { type: 'integer', minimum: 1, maximum: 5 },
                reasoning: { type: 'string' },
              },
              required: ['score', 'reasoning'],
            },
            null,
            2,
          ),
        },
      }),
      makeVersion(7, now - 12 * 60 * 60 * 1000, {
        messages: [
          {
            role: 'system',
            content:
              'You are a senior reviewer. Score 1-5 against:\n{{rubric}}\n\nReturn {"score","reasoning","flags"}. No prose.',
          },
          { role: 'user', content: 'Output:\n{{output}}' },
        ],
        modelParams: { model: 'claude-opus-4-7', temperature: 0, maxTokens: 1000 },
        responseFormat: {
          type: 'json_schema',
          schema: JSON.stringify(
            {
              type: 'object',
              properties: {
                score: { type: 'integer', minimum: 1, maximum: 5 },
                reasoning: { type: 'string' },
                flags: { type: 'array', items: { type: 'string' } },
              },
              required: ['score', 'reasoning'],
            },
            null,
            2,
          ),
        },
      }),
    ],
  },
  {
    id: 'p_summarizer',
    name: 'summarizer',
    description: 'One-paragraph summary of an arbitrary input document.',
    createdAt: now - 3 * DAY,
    updatedAt: now - 3 * DAY,
    versions: [
      makeVersion(1, now - 3 * DAY, {
        messages: [
          { role: 'system', content: 'Summarize the input in one paragraph. No more than 80 words.' },
          { role: 'user', content: '{{input}}' },
        ],
        modelParams: { model: 'gpt-4o-mini', temperature: 0.3, maxTokens: 300 },
      }),
    ],
  },
]

export async function listPrompts(): Promise<Prompt[]> {
  return delay([...prompts])
}

export async function getPrompt(id: string): Promise<Prompt | null> {
  return delay(prompts.find((p) => p.id === id) ?? null)
}

export async function createPrompt(input: CreatePromptInput): Promise<Prompt> {
  const created = Date.now()
  const initialMessages = input.initialMessages?.length
    ? input.initialMessages
    : [{ role: 'system' as const, content: '' }]
  const version: PromptVersion = {
    id: randomId('v'),
    version: 1,
    createdAt: created,
    author: 'ivan',
    messages: initialMessages,
    modelParams: { model: input.initialModel ?? 'gpt-4o-mini', temperature: 0.7 },
    tools: [],
    responseFormat: { type: 'text' },
  }
  const prompt: Prompt = {
    id: randomId('p'),
    name: input.name,
    description: input.description,
    createdAt: created,
    updatedAt: created,
    versions: [version],
  }
  prompts.unshift(prompt)
  return delay(prompt)
}

export async function saveNewVersion(promptId: string, versionInput: SaveVersionInput): Promise<PromptVersion> {
  const prompt = prompts.find((p) => p.id === promptId)
  if (!prompt) throw new Error(`Prompt ${promptId} not found`)
  const latest = prompt.versions[prompt.versions.length - 1]
  const nextVersion: PromptVersion = {
    id: randomId('v'),
    version: (latest?.version ?? 0) + 1,
    createdAt: Date.now(),
    author: versionInput.author ?? 'ivan',
    messages: versionInput.messages,
    modelParams: versionInput.modelParams,
    tools: versionInput.tools,
    responseFormat: versionInput.responseFormat,
  }
  prompt.versions.push(nextVersion)
  prompt.updatedAt = nextVersion.createdAt
  return delay(nextVersion)
}

export async function updatePrompt(promptId: string, patch: { name?: string; description?: string }): Promise<Prompt> {
  const prompt = prompts.find((p) => p.id === promptId)
  if (!prompt) throw new Error(`Prompt ${promptId} not found`)
  if (patch.name !== undefined) prompt.name = patch.name
  if (patch.description !== undefined) prompt.description = patch.description
  prompt.updatedAt = Date.now()
  return delay(prompt)
}

export async function deletePrompt(promptId: string): Promise<void> {
  const idx = prompts.findIndex((p) => p.id === promptId)
  if (idx >= 0) prompts.splice(idx, 1)
  return delay(undefined)
}

const runs: PromptRun[] = []

export async function listRuns(promptId: string): Promise<PromptRun[]> {
  const matched = runs.filter((r) => r.promptId === promptId).sort((a, b) => b.createdAt - a.createdAt)
  return delay(matched)
}

export async function getRun(runId: string): Promise<PromptRun | null> {
  return delay(runs.find((r) => r.id === runId) ?? null)
}

function hashString(input: string): number {
  let h = 2166136261
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}

function lastUserMessage(messages: Message[]): string {
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i].role === 'user') return messages[i].content
  }
  return ''
}

function looksLikeJudge(messages: Message[]): boolean {
  const sys = messages.find((m) => m.role === 'system')?.content.toLowerCase() ?? ''
  return sys.includes('judge') || sys.includes('reviewer') || sys.includes('evaluate') || sys.includes('score')
}

function looksLikeSummarizer(messages: Message[]): boolean {
  const sys = messages.find((m) => m.role === 'system')?.content.toLowerCase() ?? ''
  return sys.includes('summar')
}

function substitute(text: string, vars: Record<string, string>): string {
  return text.replace(/\{\{(\w+)\}\}/g, (_, name) => vars[name] ?? '')
}

function buildMockOutput(messages: Message[], vars: Record<string, string>, seed: number): string {
  if (looksLikeJudge(messages)) {
    const scores = [0.62, 0.74, 0.81, 0.87, 0.93]
    const reasons = [
      'the output addresses the core question with appropriate tone.',
      'response is well-formed but lacks specificity on edge cases.',
      'mock judgment: the output appears well-formed and addresses the core question.',
      'reasoning chain is solid; minor formatting issues noted.',
    ]
    const score = scores[seed % scores.length]
    const reasoning = reasons[seed % reasons.length]
    return JSON.stringify({ score, reasoning }, null, 2)
  }
  if (looksLikeSummarizer(messages)) {
    const variants = [
      'Summary (mock): The key points are (1) lorem ipsum, (2) dolor sit amet, (3) consectetur adipiscing elit.',
      'Summary (mock): Three takeaways emerge — (1) the system behaves as expected, (2) latency is within target, (3) further tuning is optional.',
      'Summary (mock): The document covers (1) background, (2) approach, (3) results, with emphasis on the third section.',
    ]
    return variants[seed % variants.length]
  }
  const name = vars.name || vars.user_name || 'there'
  const lastUser = substitute(lastUserMessage(messages), vars).trim()
  const greetings = [
    `Hi ${name}! I can help you with that. Based on what you've shared, here's my take: [mock response]. Let me know if you need anything else.`,
    `Hello ${name}. Looking at this, I'd suggest the following approach: [mock approach with three short steps]. Happy to expand on any of them.`,
    `Hey ${name} — quick read: [mock observation]. The next sensible step would be to [mock action]. Want me to go deeper?`,
  ]
  if (lastUser) {
    const echoed = lastUser.length > 120 ? `${lastUser.slice(0, 120)}…` : lastUser
    return `You said: "${echoed}"\n\n${greetings[seed % greetings.length]}`
  }
  return greetings[seed % greetings.length]
}

export async function runPrompt(input: {
  promptId: string
  versionId: string
  varValues: Record<string, string>
  currentMessages: Message[]
  modelParams: ModelParams
}): Promise<PromptRun> {
  const prompt = prompts.find((p) => p.id === input.promptId)
  if (!prompt) throw new Error(`Prompt ${input.promptId} not found`)
  const version = prompt.versions.find((v) => v.id === input.versionId)
  const versionNumber = version?.version ?? prompt.versions[prompt.versions.length - 1]?.version ?? 1

  const delayMs = 800 + Math.floor(Math.random() * 400)
  const seed = hashString(
    `${input.versionId}|${JSON.stringify(input.varValues)}|${JSON.stringify(input.currentMessages)}`,
  )
  const output = buildMockOutput(input.currentMessages, input.varValues, seed)

  await new Promise<void>((resolve) => setTimeout(resolve, delayMs))

  const run: PromptRun = {
    id: randomId('run'),
    promptId: input.promptId,
    versionId: input.versionId,
    versionNumber,
    varValues: { ...input.varValues },
    output,
    durationMs: delayMs,
    createdAt: Date.now(),
  }
  runs.push(run)
  return run
}
