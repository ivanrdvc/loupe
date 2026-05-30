import { createHash } from 'node:crypto'
import { readdir, readFile } from 'node:fs/promises'
import { isAbsolute, join, relative, sep } from 'node:path'
import { createServerFn } from '@tanstack/react-start'
import { and, desc, eq } from 'drizzle-orm'
import { db } from '#/db'
import { promptFolders, prompts, promptVersions } from '#/db/schema'
import type { Message, ModelParams } from '#/routes/inventory/system-prompts/-types'

export type SyncConfig = {
  repoPath: string | null
  glob: string
  configured: boolean
}

export type SyncResult = {
  created: number
  updated: number
  skipped: number
  errors: { file: string; message: string }[]
  files: string[]
}

const DEFAULT_GLOB = 'prompts/**/*.md'

function getConfig(): SyncConfig {
  const repoPath = process.env.AGENT_REPO_PATH?.trim() || null
  const glob = process.env.AGENT_PROMPTS_GLOB?.trim() || DEFAULT_GLOB
  return { repoPath, glob, configured: repoPath != null }
}

export const getSyncConfig = createServerFn({ method: 'GET' }).handler(async (): Promise<SyncConfig> => getConfig())

type Frontmatter = {
  name?: string
  description?: string
  model?: string
  temperature?: number
  maxTokens?: number
  topP?: number
}

function parseFrontmatter(raw: string): { meta: Frontmatter; body: string } {
  const match = raw.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/)
  if (!match) return { meta: {}, body: raw }
  const [, head, body] = match
  const meta: Frontmatter = {}
  for (const line of head.split('\n')) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const idx = trimmed.indexOf(':')
    if (idx < 0) continue
    const key = trimmed.slice(0, idx).trim()
    let value = trimmed.slice(idx + 1).trim()
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1)
    }
    switch (key) {
      case 'name':
        meta.name = value
        break
      case 'description':
        meta.description = value
        break
      case 'model':
        meta.model = value
        break
      case 'temperature': {
        const n = Number(value)
        if (Number.isFinite(n)) meta.temperature = n
        break
      }
      case 'max_tokens':
      case 'maxTokens': {
        const n = Number(value)
        if (Number.isFinite(n)) meta.maxTokens = n
        break
      }
      case 'top_p':
      case 'topP': {
        const n = Number(value)
        if (Number.isFinite(n)) meta.topP = n
        break
      }
    }
  }
  return { meta, body: body ?? '' }
}

async function walkMarkdown(root: string, subdir: string): Promise<string[]> {
  const out: string[] = []
  const queue: string[] = [join(root, subdir)]
  while (queue.length > 0) {
    const dir = queue.pop()
    if (!dir) break
    const entries = await readdir(dir, { withFileTypes: true }).catch((err: NodeJS.ErrnoException) => {
      if (err.code === 'ENOENT') return null
      throw err
    })
    if (!entries) continue
    for (const entry of entries) {
      const full = join(dir, entry.name)
      if (entry.isDirectory()) {
        queue.push(full)
      } else if (entry.isFile() && entry.name.endsWith('.md')) {
        out.push(full)
      }
    }
  }
  return out
}

function hashSource(raw: string): string {
  return createHash('sha256').update(raw, 'utf8').digest('hex').slice(0, 7)
}

async function ensureSystemFolderId(): Promise<number> {
  const [existing] = await db.select().from(promptFolders).where(eq(promptFolders.kind, 'system')).limit(1)
  if (existing) return existing.id
  const now = new Date()
  const [created] = await db
    .insert(promptFolders)
    .values({ name: 'System', kind: 'system', parentId: null, createdAt: now, updatedAt: now })
    .returning()
  if (!created) throw new Error('ensureSystemFolderId: insert failed')
  return created.id
}

export const syncSystemPrompts = createServerFn({ method: 'POST' }).handler(
  async (): Promise<SyncResult> => runSyncImpl(),
)

async function runSyncImpl(): Promise<SyncResult> {
  const config = getConfig()
  if (!config.repoPath) {
    throw new Error('AGENT_REPO_PATH is not set. Configure it in .env.local to enable sync.')
  }
  if (!isAbsolute(config.repoPath)) {
    throw new Error('AGENT_REPO_PATH must be an absolute path')
  }
  const subdir = config.glob.replace(/\/\*\*\/.+$/, '').replace(/\/$/, '') || '.'
  const files = await walkMarkdown(config.repoPath, subdir)
  const result: SyncResult = { created: 0, updated: 0, skipped: 0, errors: [], files: [] }
  const systemFolderId = await ensureSystemFolderId()
  const now = new Date()

  for (const file of files) {
    try {
      const rel = relative(config.repoPath, file).split(sep).join('/')
      result.files.push(rel)
      const raw = await readFile(file, 'utf8')
      const { meta, body } = parseFrontmatter(raw)
      const trimmedBody = body.trim()
      const name = meta.name?.trim() || rel.replace(/\.md$/, '').replace(/\//g, '-')
      const hash = hashSource(raw)
      const sourceRef = `${rel}@${hash}`
      const messages: Message[] = [{ role: 'system', content: trimmedBody }]
      const modelParams: ModelParams = {
        model: meta.model ?? 'gpt-4o-mini',
        ...(meta.temperature != null ? { temperature: meta.temperature } : {}),
        ...(meta.maxTokens != null ? { maxTokens: meta.maxTokens } : {}),
        ...(meta.topP != null ? { topP: meta.topP } : {}),
      }

      const [existingPrompt] = await db
        .select()
        .from(prompts)
        .where(and(eq(prompts.folderId, systemFolderId), eq(prompts.name, name)))
        .limit(1)

      if (!existingPrompt) {
        const [created] = await db
          .insert(prompts)
          .values({
            folderId: systemFolderId,
            name,
            description: meta.description ?? null,
            createdAt: now,
            updatedAt: now,
          })
          .returning()
        if (!created) throw new Error('insert prompt failed')
        await db.insert(promptVersions).values({
          promptId: created.id,
          version: 1,
          messagesJson: messages,
          modelParamsJson: modelParams,
          toolsJson: [],
          responseFormatJson: { type: 'text' },
          author: 'sync',
          sourceRef,
          createdAt: now,
        })
        result.created += 1
        continue
      }

      const [latest] = await db
        .select()
        .from(promptVersions)
        .where(eq(promptVersions.promptId, existingPrompt.id))
        .orderBy(desc(promptVersions.version))
        .limit(1)
      if (latest?.sourceRef === sourceRef) {
        result.skipped += 1
        continue
      }

      const nextVersion = (latest?.version ?? 0) + 1

      await db.insert(promptVersions).values({
        promptId: existingPrompt.id,
        version: nextVersion,
        messagesJson: messages,
        modelParamsJson: modelParams,
        toolsJson: [],
        responseFormatJson: { type: 'text' },
        author: 'sync',
        sourceRef,
        createdAt: now,
      })
      await db
        .update(prompts)
        .set({ description: meta.description ?? existingPrompt.description, updatedAt: now })
        .where(eq(prompts.id, existingPrompt.id))
      result.updated += 1
    } catch (err) {
      result.errors.push({ file, message: err instanceof Error ? err.message : String(err) })
    }
  }

  return result
}
