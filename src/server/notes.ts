import { createServerFn } from '@tanstack/react-start'
import { and, desc, eq } from 'drizzle-orm'
import { db } from '#/db'
import { notes } from '#/db/schema'
import type { Note, NoteTargetKind, UpsertNoteInput } from '#/routes/notes/-types'

const KINDS: NoteTargetKind[] = ['session', 'trace', 'span', 'prompt', 'experiment']

function asKind(value: unknown): NoteTargetKind {
  if (typeof value !== 'string' || !KINDS.includes(value as NoteTargetKind)) {
    throw new Error(`Invalid note target kind: ${String(value)}`)
  }
  return value as NoteTargetKind
}

function toNote(row: typeof notes.$inferSelect): Note {
  return {
    id: row.id,
    targetKind: row.targetKind,
    targetId: row.targetId,
    body: row.body,
    author: row.author,
    createdAt: row.createdAt.getTime(),
    updatedAt: row.updatedAt.getTime(),
  }
}

const SEED_NOTES: Omit<Note, 'id' | 'createdAt' | 'updatedAt'>[] = [
  {
    targetKind: 'session',
    targetId: 'sess_3f9a2c1b',
    body: '`search_db` returned ~4MB of JSON on a simple lookup. Context blew past 80% by turn 3. Trim the tool output schema or paginate.',
    author: 'ivan',
  },
  {
    targetKind: 'session',
    targetId: 'sess_a814e07f',
    body: "Agent didn't call the right tool first try — went `web_search` instead of `lookup_customer`. System prompt is ambiguous about when to prefer internal tools.",
    author: 'ivan',
  },
  {
    targetKind: 'trace',
    targetId: 'trc_57b40d22e8af1c93',
    body: 'Frontend never received the streamed tool result — `load_invoice` ran but the UI stayed on the loading state. Suspect the SSE channel dropped after the first chunk.',
    author: 'ivan',
  },
  {
    targetKind: 'span',
    targetId: 'span_b3e2f1a049cd',
    body: 'Model picked `set_address` with wrong arg shape (`zip` as int, not string). Tool description needs an explicit type hint.',
    author: 'ivan',
  },
  {
    targetKind: 'prompt',
    targetId: 'p_reviewer',
    body: 'v6 is over-strict on JSON parse failures. Worth A/B against v5 before promoting.',
    author: 'ivan',
  },
  {
    targetKind: 'prompt',
    targetId: 'p_greeter',
    body: 'Few-shot example #3 leaks the customer-id format in the assistant reply — strip before next deploy.',
    author: 'ivan',
  },
  {
    targetKind: 'prompt',
    targetId: 'p_summarizer',
    body: 'Single version still. Add a few-shot example for long inputs > 8k tokens.',
    author: 'ivan',
  },
]

let seedPromise: Promise<void> | null = null

async function ensureSeed(): Promise<void> {
  if (seedPromise) return seedPromise
  seedPromise = (async () => {
    const existing = await db.select({ id: notes.id }).from(notes).limit(1)
    if (existing.length > 0) return
    const now = Date.now()
    const HOUR = 60 * 60 * 1000
    const DAY = 24 * HOUR
    const offsets = [45 * 60 * 1000, 3 * HOUR, 6 * HOUR, 1 * DAY, 2 * DAY, 4 * DAY, 5 * DAY]
    const rows = SEED_NOTES.map((n, i) => {
      const ts = new Date(now - (offsets[i] ?? 0))
      return { ...n, createdAt: ts, updatedAt: ts }
    })
    await db.insert(notes).values(rows).onConflictDoNothing()
  })().catch((err) => {
    seedPromise = null
    throw err
  })
  return seedPromise
}

export const listAllNotes = createServerFn({ method: 'GET' }).handler(async (): Promise<Note[]> => {
  await ensureSeed()
  const rows = await db.select().from(notes).orderBy(desc(notes.updatedAt))
  return rows.map(toNote)
})

export const getNoteForTarget = createServerFn({ method: 'GET' })
  .inputValidator((input: { targetKind: NoteTargetKind; targetId: string }) => ({
    targetKind: asKind(input.targetKind),
    targetId: String(input.targetId),
  }))
  .handler(async ({ data }): Promise<Note | null> => {
    const rows = await db
      .select()
      .from(notes)
      .where(and(eq(notes.targetKind, data.targetKind), eq(notes.targetId, data.targetId)))
      .limit(1)
    return rows[0] ? toNote(rows[0]) : null
  })

export const upsertNote = createServerFn({ method: 'POST' })
  .inputValidator((input: UpsertNoteInput) => ({
    targetKind: asKind(input.targetKind),
    targetId: String(input.targetId),
    body: String(input.body),
    author: String(input.author),
  }))
  .handler(async ({ data }): Promise<Note> => {
    const now = new Date()
    const [row] = await db
      .insert(notes)
      .values({
        targetKind: data.targetKind,
        targetId: data.targetId,
        body: data.body,
        author: data.author,
        createdAt: now,
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: [notes.targetKind, notes.targetId],
        set: { body: data.body, author: data.author, updatedAt: now },
      })
      .returning()
    if (!row) throw new Error('upsertNote: no row returned')
    return toNote(row)
  })

export const deleteNote = createServerFn({ method: 'POST' })
  .inputValidator((id: number) => Number(id))
  .handler(async ({ data }): Promise<void> => {
    await db.delete(notes).where(eq(notes.id, data))
  })

export const getNoteFlagsForKind = createServerFn({ method: 'GET' })
  .inputValidator((kind: NoteTargetKind) => asKind(kind))
  .handler(async ({ data }): Promise<Record<string, boolean>> => {
    await ensureSeed()
    const rows = await db
      .select({ targetId: notes.targetId })
      .from(notes)
      .where(eq(notes.targetKind, data))
      .groupBy(notes.targetId)
    const flags: Record<string, boolean> = {}
    for (const r of rows) flags[r.targetId] = true
    return flags
  })
