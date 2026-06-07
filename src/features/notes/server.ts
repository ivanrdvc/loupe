import { createServerFn } from '@tanstack/react-start'
import { and, asc, desc, eq } from 'drizzle-orm'
import { db } from '#/db'
import { notes } from '#/db/schema'
import type { Note, NoteStatus, NoteTargetKind, UpsertNoteInput } from '#/features/notes/types'

const KINDS: NoteTargetKind[] = ['session', 'trace', 'span', 'prompt', 'experiment']
const STATUSES: NoteStatus[] = ['open', 'resolved']

function asKind(value: unknown): NoteTargetKind {
  if (typeof value !== 'string' || !KINDS.includes(value as NoteTargetKind)) {
    throw new Error(`Invalid note target kind: ${String(value)}`)
  }
  return value as NoteTargetKind
}

function asStatus(value: unknown): NoteStatus {
  if (typeof value !== 'string' || !STATUSES.includes(value as NoteStatus)) {
    throw new Error(`Invalid note status: ${String(value)}`)
  }
  return value as NoteStatus
}

function toNote(row: typeof notes.$inferSelect): Note {
  return {
    id: row.id,
    targetKind: row.targetKind,
    targetId: row.targetId,
    parentTraceId: row.parentTraceId,
    parentSessionId: row.parentSessionId,
    body: row.body,
    author: row.author,
    status: row.status,
    resolvedAt: row.resolvedAt ? row.resolvedAt.getTime() : null,
    createdAt: row.createdAt.getTime(),
    updatedAt: row.updatedAt.getTime(),
  }
}

export const listAllNotes = createServerFn({ method: 'GET' }).handler(async (): Promise<Note[]> => {
  const rows = await db.select().from(notes).orderBy(asc(notes.status), desc(notes.updatedAt))
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

function asOptionalString(value: unknown): string | null {
  if (value == null) return null
  const s = String(value).trim()
  return s.length > 0 ? s : null
}

export const upsertNote = createServerFn({ method: 'POST' })
  .inputValidator((input: UpsertNoteInput) => ({
    targetKind: asKind(input.targetKind),
    targetId: String(input.targetId),
    parentTraceId: asOptionalString(input.parentTraceId),
    parentSessionId: asOptionalString(input.parentSessionId),
    body: String(input.body),
    author: String(input.author),
  }))
  .handler(async ({ data }): Promise<Note> => {
    const now = new Date()
    const updateSet: Partial<typeof notes.$inferInsert> = {
      body: data.body,
      author: data.author,
      updatedAt: now,
    }
    if (data.parentTraceId != null) updateSet.parentTraceId = data.parentTraceId
    if (data.parentSessionId != null) updateSet.parentSessionId = data.parentSessionId

    const [row] = await db
      .insert(notes)
      .values({
        targetKind: data.targetKind,
        targetId: data.targetId,
        parentTraceId: data.parentTraceId,
        parentSessionId: data.parentSessionId,
        body: data.body,
        author: data.author,
        createdAt: now,
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: [notes.targetKind, notes.targetId],
        set: updateSet,
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

export const setNoteStatus = createServerFn({ method: 'POST' })
  .inputValidator((input: { id: number; status: NoteStatus }) => ({
    id: Number(input.id),
    status: asStatus(input.status),
  }))
  .handler(async ({ data }): Promise<Note> => {
    const now = new Date()
    const [row] = await db
      .update(notes)
      .set({
        status: data.status,
        resolvedAt: data.status === 'resolved' ? now : null,
        updatedAt: now,
      })
      .where(eq(notes.id, data.id))
      .returning()
    if (!row) throw new Error('setNoteStatus: note not found')
    return toNote(row)
  })

export const getNoteFlagsForKind = createServerFn({ method: 'GET' })
  .inputValidator((kind: NoteTargetKind) => asKind(kind))
  .handler(async ({ data }): Promise<Record<string, boolean>> => {
    const rows = await db
      .select({ targetId: notes.targetId })
      .from(notes)
      .where(eq(notes.targetKind, data))
      .groupBy(notes.targetId)
    const flags: Record<string, boolean> = {}
    for (const r of rows) flags[r.targetId] = true
    return flags
  })
