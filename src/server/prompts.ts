import { createServerFn } from '@tanstack/react-start'
import { asc, desc, eq, isNull, max } from 'drizzle-orm'
import { db } from '#/db'
import { promptFolders, prompts, promptVersions } from '#/db/schema'
import type {
  CreateFolderInput,
  CreatePromptInput,
  CreateVersionInput,
  FolderKind,
  Message,
  ModelParams,
  Prompt,
  PromptFolder,
  PromptVersion,
  PromptWithVersions,
  ResponseFormat,
  Tool,
  UpdatePromptMetaInput,
} from '#/routes/prompts/-types'

function toFolder(row: typeof promptFolders.$inferSelect): PromptFolder {
  return {
    id: row.id,
    name: row.name,
    parentId: row.parentId,
    kind: row.kind,
    createdAt: row.createdAt.getTime(),
    updatedAt: row.updatedAt.getTime(),
  }
}

function toPrompt(row: typeof prompts.$inferSelect): Prompt {
  return {
    id: row.id,
    folderId: row.folderId,
    name: row.name,
    description: row.description,
    createdAt: row.createdAt.getTime(),
    updatedAt: row.updatedAt.getTime(),
  }
}

function toVersion(row: typeof promptVersions.$inferSelect): PromptVersion {
  return {
    id: row.id,
    promptId: row.promptId,
    version: row.version,
    messages: (row.messagesJson as Message[]) ?? [],
    modelParams: (row.modelParamsJson as ModelParams) ?? { model: '' },
    tools: (row.toolsJson as Tool[]) ?? [],
    responseFormat: (row.responseFormatJson as ResponseFormat) ?? { type: 'text' },
    author: row.author,
    createdAt: row.createdAt.getTime(),
  }
}

function asFolderKind(value: unknown): FolderKind {
  if (value === 'system') return 'system'
  return 'user'
}

const DEFAULT_MODEL_PARAMS: ModelParams = { model: 'gpt-4o-mini', temperature: 0.7 }
const DEFAULT_MESSAGES: Message[] = [{ role: 'system', content: '' }]

let seedPromise: Promise<void> | null = null

async function ensureSeed(): Promise<void> {
  if (seedPromise) return seedPromise
  seedPromise = (async () => {
    db.transaction((tx) => {
      const existing = tx.select({ id: promptFolders.id }).from(promptFolders).limit(1).all()
      if (existing.length > 0) return
      const now = new Date()
      const [system] = tx
        .insert(promptFolders)
        .values({ name: 'System', kind: 'system', parentId: null, createdAt: now, updatedAt: now })
        .returning()
        .all()
      const [user] = tx
        .insert(promptFolders)
        .values({ name: 'My prompts', kind: 'user', parentId: null, createdAt: now, updatedAt: now })
        .returning()
        .all()
      if (!system || !user) throw new Error('seed: folder insert returned nothing')

      const [systemPrompt] = tx
        .insert(prompts)
        .values({
          folderId: system.id,
          name: 'router-system',
          description: 'Top-level system prompt for the router agent.',
          createdAt: now,
          updatedAt: now,
        })
        .returning()
        .all()
      if (systemPrompt) {
        tx.insert(promptVersions)
          .values({
            promptId: systemPrompt.id,
            version: 1,
            messagesJson: [{ role: 'system', content: 'You route the request to the right specialist agent.' }],
            modelParamsJson: { model: 'gpt-4o-mini', temperature: 0 },
            toolsJson: [],
            responseFormatJson: { type: 'text' },
            author: 'system',
            createdAt: now,
          })
          .run()
      }

      const [userPrompt] = tx
        .insert(prompts)
        .values({
          folderId: user.id,
          name: 'summarizer',
          description: 'One-paragraph summary of an arbitrary input document.',
          createdAt: now,
          updatedAt: now,
        })
        .returning()
        .all()
      if (userPrompt) {
        tx.insert(promptVersions)
          .values({
            promptId: userPrompt.id,
            version: 1,
            messagesJson: [
              { role: 'system', content: 'Summarize the input in one paragraph. No more than 80 words.' },
              { role: 'user', content: '{{input}}' },
            ],
            modelParamsJson: { model: 'gpt-4o-mini', temperature: 0.3, maxTokens: 300 },
            toolsJson: [],
            responseFormatJson: { type: 'text' },
            author: 'ivan',
            createdAt: now,
          })
          .run()
      }
    })
  })().catch((err) => {
    seedPromise = null
    throw err
  })
  return seedPromise
}

export const listFolders = createServerFn({ method: 'GET' }).handler(async (): Promise<PromptFolder[]> => {
  await ensureSeed()
  const rows = await db.select().from(promptFolders).orderBy(asc(promptFolders.name))
  return rows.map(toFolder)
})

export const listPrompts = createServerFn({ method: 'GET' })
  .inputValidator((input: { folderId?: number | null } | undefined) => ({
    folderId: input?.folderId === undefined ? undefined : input.folderId === null ? null : Number(input.folderId),
  }))
  .handler(async ({ data }): Promise<Prompt[]> => {
    await ensureSeed()
    const where =
      data.folderId === undefined
        ? undefined
        : data.folderId === null
          ? isNull(prompts.folderId)
          : eq(prompts.folderId, data.folderId)
    const rows = where
      ? await db.select().from(prompts).where(where).orderBy(desc(prompts.updatedAt))
      : await db.select().from(prompts).orderBy(desc(prompts.updatedAt))
    return rows.map(toPrompt)
  })

export const getPrompt = createServerFn({ method: 'GET' })
  .inputValidator((input: { promptId: number | string }) => ({ promptId: Number(input.promptId) }))
  .handler(async ({ data }): Promise<PromptWithVersions | null> => {
    const [row] = await db.select().from(prompts).where(eq(prompts.id, data.promptId)).limit(1)
    if (!row) return null
    const versionRows = await db
      .select()
      .from(promptVersions)
      .where(eq(promptVersions.promptId, data.promptId))
      .orderBy(desc(promptVersions.version))
    return { prompt: toPrompt(row), versions: versionRows.map(toVersion) }
  })

export const createPrompt = createServerFn({ method: 'POST' })
  .inputValidator((input: CreatePromptInput) => ({
    folderId: input.folderId == null ? null : Number(input.folderId),
    name: String(input.name).trim(),
    description: input.description == null ? null : String(input.description),
    initialMessages: input.initialMessages,
    initialModelParams: input.initialModelParams,
    author: String(input.author),
  }))
  .handler(async ({ data }): Promise<PromptWithVersions> => {
    if (!data.name) throw new Error('Prompt name is required')
    const now = new Date()
    const [prompt] = await db
      .insert(prompts)
      .values({
        folderId: data.folderId,
        name: data.name,
        description: data.description,
        createdAt: now,
        updatedAt: now,
      })
      .returning()
    if (!prompt) throw new Error('createPrompt: no row returned')
    const [version] = await db
      .insert(promptVersions)
      .values({
        promptId: prompt.id,
        version: 1,
        messagesJson: data.initialMessages && data.initialMessages.length > 0 ? data.initialMessages : DEFAULT_MESSAGES,
        modelParamsJson: data.initialModelParams ?? DEFAULT_MODEL_PARAMS,
        toolsJson: [],
        responseFormatJson: { type: 'text' },
        author: data.author,
        createdAt: now,
      })
      .returning()
    if (!version) throw new Error('createPrompt: version insert failed')
    return { prompt: toPrompt(prompt), versions: [toVersion(version)] }
  })

export const updatePromptMeta = createServerFn({ method: 'POST' })
  .inputValidator((input: UpdatePromptMetaInput) => ({
    promptId: Number(input.promptId),
    name: input.name === undefined ? undefined : String(input.name).trim(),
    description:
      input.description === undefined ? undefined : input.description === null ? null : String(input.description),
    folderId: input.folderId === undefined ? undefined : input.folderId === null ? null : Number(input.folderId),
  }))
  .handler(async ({ data }): Promise<Prompt> => {
    const set: Partial<typeof prompts.$inferInsert> = { updatedAt: new Date() }
    if (data.name !== undefined) set.name = data.name
    if (data.description !== undefined) set.description = data.description
    if (data.folderId !== undefined) set.folderId = data.folderId
    const [row] = await db.update(prompts).set(set).where(eq(prompts.id, data.promptId)).returning()
    if (!row) throw new Error('updatePromptMeta: prompt not found')
    return toPrompt(row)
  })

export const deletePrompt = createServerFn({ method: 'POST' })
  .inputValidator((input: { promptId: number }) => ({ promptId: Number(input.promptId) }))
  .handler(async ({ data }): Promise<void> => {
    const [row] = await db
      .select({ folderId: prompts.folderId })
      .from(prompts)
      .where(eq(prompts.id, data.promptId))
      .limit(1)
    if (row?.folderId != null) {
      const [folder] = await db
        .select({ kind: promptFolders.kind })
        .from(promptFolders)
        .where(eq(promptFolders.id, row.folderId))
        .limit(1)
      if (folder?.kind === 'system') {
        throw new Error('Cannot delete a prompt inside the System folder')
      }
    }
    await db.delete(prompts).where(eq(prompts.id, data.promptId))
  })

export const createVersion = createServerFn({ method: 'POST' })
  .inputValidator((input: CreateVersionInput) => ({
    promptId: Number(input.promptId),
    messages: input.messages,
    modelParams: input.modelParams,
    tools: input.tools,
    responseFormat: input.responseFormat,
    author: String(input.author),
  }))
  .handler(async ({ data }): Promise<PromptVersion> => {
    const now = new Date()
    const row = db.transaction((tx) => {
      const [{ value: currentMax } = { value: 0 }] = tx
        .select({ value: max(promptVersions.version) })
        .from(promptVersions)
        .where(eq(promptVersions.promptId, data.promptId))
        .all()
      const nextVersion = (currentMax ?? 0) + 1
      const [inserted] = tx
        .insert(promptVersions)
        .values({
          promptId: data.promptId,
          version: nextVersion,
          messagesJson: data.messages,
          modelParamsJson: data.modelParams,
          toolsJson: data.tools,
          responseFormatJson: data.responseFormat,
          author: data.author,
          createdAt: now,
        })
        .returning()
        .all()
      if (!inserted) throw new Error('createVersion: insert failed')
      tx.update(prompts).set({ updatedAt: now }).where(eq(prompts.id, data.promptId)).run()
      return inserted
    })
    return toVersion(row)
  })

export const createFolder = createServerFn({ method: 'POST' })
  .inputValidator((input: CreateFolderInput) => ({
    name: String(input.name).trim(),
    parentId: input.parentId == null ? null : Number(input.parentId),
    kind: asFolderKind(input.kind),
  }))
  .handler(async ({ data }): Promise<PromptFolder> => {
    if (!data.name) throw new Error('Folder name is required')
    if (data.parentId != null) {
      const [parent] = await db
        .select({ kind: promptFolders.kind })
        .from(promptFolders)
        .where(eq(promptFolders.id, data.parentId))
        .limit(1)
      if (!parent) throw new Error('Parent folder not found')
      if (parent.kind === 'system') throw new Error('Cannot nest folders under the System folder')
    }
    const now = new Date()
    const [row] = await db
      .insert(promptFolders)
      .values({ name: data.name, parentId: data.parentId, kind: data.kind, createdAt: now, updatedAt: now })
      .returning()
    if (!row) throw new Error('createFolder: insert failed')
    return toFolder(row)
  })

export const renameFolder = createServerFn({ method: 'POST' })
  .inputValidator((input: { id: number; name: string }) => ({ id: Number(input.id), name: String(input.name).trim() }))
  .handler(async ({ data }): Promise<PromptFolder> => {
    if (!data.name) throw new Error('Folder name is required')
    const [row] = await db
      .update(promptFolders)
      .set({ name: data.name, updatedAt: new Date() })
      .where(eq(promptFolders.id, data.id))
      .returning()
    if (!row) throw new Error('renameFolder: folder not found')
    return toFolder(row)
  })

export const deleteFolder = createServerFn({ method: 'POST' })
  .inputValidator((input: { id: number }) => ({ id: Number(input.id) }))
  .handler(async ({ data }): Promise<void> => {
    const childFolders = await db
      .select({ id: promptFolders.id })
      .from(promptFolders)
      .where(eq(promptFolders.parentId, data.id))
      .limit(1)
    if (childFolders.length > 0) throw new Error('Folder is not empty: contains subfolders')
    const childPrompts = await db.select({ id: prompts.id }).from(prompts).where(eq(prompts.folderId, data.id)).limit(1)
    if (childPrompts.length > 0) throw new Error('Folder is not empty: contains prompts')
    await db.delete(promptFolders).where(eq(promptFolders.id, data.id))
  })
