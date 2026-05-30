import { createServerFn } from '@tanstack/react-start'
import { asc, desc, eq, inArray, isNull, max } from 'drizzle-orm'
import { db } from '#/db'
import { promptFolders, prompts, promptTagLinks, promptTags, promptVersions } from '#/db/schema'
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
  Tag,
  Tool,
  UpdatePromptMetaInput,
} from '#/routes/inventory/system-prompts/-types'

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

function toPrompt(row: typeof prompts.$inferSelect, tagIds: number[] = []): Prompt {
  return {
    id: row.id,
    folderId: row.folderId,
    name: row.name,
    description: row.description,
    runConfig: (row.runConfigJson as Prompt['runConfig']) ?? null,
    tagIds,
    createdAt: row.createdAt.getTime(),
    updatedAt: row.updatedAt.getTime(),
  }
}

function toTag(row: typeof promptTags.$inferSelect): Tag {
  return {
    id: row.id,
    name: row.name,
    color: row.color,
    createdAt: row.createdAt.getTime(),
  }
}

async function loadTagIdsFor(promptIds: number[]): Promise<Map<number, number[]>> {
  const map = new Map<number, number[]>()
  if (promptIds.length === 0) return map
  const rows = await db
    .select({ promptId: promptTagLinks.promptId, tagId: promptTagLinks.tagId })
    .from(promptTagLinks)
    .where(inArray(promptTagLinks.promptId, promptIds))
  for (const r of rows) {
    const list = map.get(r.promptId) ?? []
    list.push(r.tagId)
    map.set(r.promptId, list)
  }
  return map
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
    sourceRef: row.sourceRef,
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
    const tagMap = await loadTagIdsFor(rows.map((r) => r.id))
    return rows.map((r) => toPrompt(r, tagMap.get(r.id) ?? []))
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
    let folder: PromptFolder | null = null
    if (row.folderId != null) {
      const [folderRow] = await db.select().from(promptFolders).where(eq(promptFolders.id, row.folderId)).limit(1)
      if (folderRow) folder = toFolder(folderRow)
    }
    const tagMap = await loadTagIdsFor([row.id])
    return { prompt: toPrompt(row, tagMap.get(row.id) ?? []), versions: versionRows.map(toVersion), folder }
  })

export const duplicatePrompt = createServerFn({ method: 'POST' })
  .inputValidator((input: { promptId: number | string; newName: string; targetFolderId?: number | null }) => ({
    promptId: Number(input.promptId),
    newName: String(input.newName).trim(),
    targetFolderId:
      input.targetFolderId === undefined
        ? undefined
        : input.targetFolderId === null
          ? null
          : Number(input.targetFolderId),
  }))
  .handler(async ({ data }): Promise<PromptWithVersions> => {
    if (!data.newName) throw new Error('Name is required')
    const [src] = await db.select().from(prompts).where(eq(prompts.id, data.promptId)).limit(1)
    if (!src) throw new Error('Source prompt not found')
    const versionRows = await db
      .select()
      .from(promptVersions)
      .where(eq(promptVersions.promptId, data.promptId))
      .orderBy(asc(promptVersions.version))
    const latest = versionRows[versionRows.length - 1]
    if (!latest) throw new Error('Source prompt has no versions')

    let targetFolderId: number | null
    if (data.targetFolderId !== undefined) {
      targetFolderId = data.targetFolderId
    } else if (src.folderId != null) {
      const [folder] = await db
        .select({ kind: promptFolders.kind })
        .from(promptFolders)
        .where(eq(promptFolders.id, src.folderId))
        .limit(1)
      if (folder?.kind === 'system') {
        const [userFolder] = await db.select().from(promptFolders).where(eq(promptFolders.kind, 'user')).limit(1)
        targetFolderId = userFolder?.id ?? null
      } else {
        targetFolderId = src.folderId
      }
    } else {
      targetFolderId = null
    }

    if (targetFolderId != null) {
      const [targetFolder] = await db
        .select({ kind: promptFolders.kind })
        .from(promptFolders)
        .where(eq(promptFolders.id, targetFolderId))
        .limit(1)
      if (targetFolder?.kind === 'system') throw new Error('Cannot duplicate into the System folder')
    }

    const now = new Date()
    const [newPrompt] = await db
      .insert(prompts)
      .values({
        folderId: targetFolderId,
        name: data.newName,
        description: src.description,
        createdAt: now,
        updatedAt: now,
      })
      .returning()
    if (!newPrompt) throw new Error('duplicatePrompt: insert failed')
    const [newVersion] = await db
      .insert(promptVersions)
      .values({
        promptId: newPrompt.id,
        version: 1,
        messagesJson: latest.messagesJson,
        modelParamsJson: latest.modelParamsJson,
        toolsJson: latest.toolsJson,
        responseFormatJson: latest.responseFormatJson,
        author: latest.author,
        createdAt: now,
      })
      .returning()
    if (!newVersion) throw new Error('duplicatePrompt: version insert failed')
    return { prompt: toPrompt(newPrompt), versions: [toVersion(newVersion)], folder: null }
  })

export const updateRunConfig = createServerFn({ method: 'POST' })
  .inputValidator((input: { promptId: number | string; endpointUrl?: string; agentName?: string }) => ({
    promptId: Number(input.promptId),
    endpointUrl: input.endpointUrl == null ? undefined : String(input.endpointUrl),
    agentName: input.agentName == null ? undefined : String(input.agentName),
  }))
  .handler(async ({ data }): Promise<Prompt> => {
    const [existing] = await db
      .select({ runConfigJson: prompts.runConfigJson })
      .from(prompts)
      .where(eq(prompts.id, data.promptId))
      .limit(1)
    if (!existing) throw new Error('updateRunConfig: prompt not found')
    const prev = (existing.runConfigJson as Record<string, string> | null) ?? {}
    const next: Record<string, string> = { ...prev }
    if (data.endpointUrl !== undefined) next.endpointUrl = data.endpointUrl
    if (data.agentName !== undefined) next.agentName = data.agentName
    const [row] = await db
      .update(prompts)
      .set({ runConfigJson: next, updatedAt: new Date() })
      .where(eq(prompts.id, data.promptId))
      .returning()
    if (!row) throw new Error('updateRunConfig: prompt not found')
    return toPrompt(row)
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
    return { prompt: toPrompt(prompt), versions: [toVersion(version)], folder: null }
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

const TAG_PALETTE = ['slate', 'red', 'orange', 'amber', 'green', 'teal', 'sky', 'blue', 'violet', 'pink'] as const

function asTagColor(value: unknown): string {
  if (typeof value === 'string' && (TAG_PALETTE as readonly string[]).includes(value)) return value
  return 'slate'
}

export const listTags = createServerFn({ method: 'GET' }).handler(async (): Promise<Tag[]> => {
  const rows = await db.select().from(promptTags).orderBy(asc(promptTags.name))
  return rows.map(toTag)
})

export const createTag = createServerFn({ method: 'POST' })
  .inputValidator((input: { name: string; color?: string }) => ({
    name: String(input.name).trim(),
    color: asTagColor(input.color),
  }))
  .handler(async ({ data }): Promise<Tag> => {
    if (!data.name) throw new Error('Tag name is required')
    const now = new Date()
    const existing = await db.select().from(promptTags).where(eq(promptTags.name, data.name)).limit(1)
    if (existing[0]) return toTag(existing[0])
    const [row] = await db.insert(promptTags).values({ name: data.name, color: data.color, createdAt: now }).returning()
    if (!row) throw new Error('createTag: insert failed')
    return toTag(row)
  })

export const updateTag = createServerFn({ method: 'POST' })
  .inputValidator((input: { id: number; name?: string; color?: string }) => ({
    id: Number(input.id),
    name: input.name === undefined ? undefined : String(input.name).trim(),
    color: input.color === undefined ? undefined : asTagColor(input.color),
  }))
  .handler(async ({ data }): Promise<Tag> => {
    const set: Partial<typeof promptTags.$inferInsert> = {}
    if (data.name !== undefined) {
      if (!data.name) throw new Error('Tag name is required')
      set.name = data.name
    }
    if (data.color !== undefined) set.color = data.color
    const [row] = await db.update(promptTags).set(set).where(eq(promptTags.id, data.id)).returning()
    if (!row) throw new Error('updateTag: tag not found')
    return toTag(row)
  })

export const deleteTag = createServerFn({ method: 'POST' })
  .inputValidator((input: { id: number }) => ({ id: Number(input.id) }))
  .handler(async ({ data }): Promise<void> => {
    await db.delete(promptTags).where(eq(promptTags.id, data.id))
  })

export const setPromptTags = createServerFn({ method: 'POST' })
  .inputValidator((input: { promptId: number; tagIds: number[] }) => ({
    promptId: Number(input.promptId),
    tagIds: Array.isArray(input.tagIds) ? input.tagIds.map(Number) : [],
  }))
  .handler(async ({ data }): Promise<number[]> => {
    db.transaction((tx) => {
      tx.delete(promptTagLinks).where(eq(promptTagLinks.promptId, data.promptId)).run()
      if (data.tagIds.length > 0) {
        tx.insert(promptTagLinks)
          .values(data.tagIds.map((tagId) => ({ promptId: data.promptId, tagId })))
          .run()
      }
    })
    return data.tagIds
  })
