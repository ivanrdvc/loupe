import { createServerFn } from '@tanstack/react-start'
import { asc, desc, eq, inArray, isNull } from 'drizzle-orm'
import { db } from '#/db'
import { promptFolders, prompts, promptTagLinks, promptTags, promptVersions } from '#/db/schema'
import type {
  Message,
  ModelParams,
  Prompt,
  PromptFolder,
  PromptVersion,
  PromptWithVersions,
  ResponseFormat,
  Tag,
  Tool,
} from '#/features/inventory/system-prompts/types'

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
