export type NoteTargetKind = 'session' | 'trace' | 'span' | 'prompt' | 'experiment'

export type NoteStatus = 'open' | 'resolved'

export type Note = {
  id: number
  targetKind: NoteTargetKind
  targetId: string
  parentTraceId: string | null
  parentSessionId: string | null
  body: string
  author: string
  status: NoteStatus
  resolvedAt: number | null
  createdAt: number
  updatedAt: number
}

export type UpsertNoteInput = {
  targetKind: NoteTargetKind
  targetId: string
  parentTraceId?: string | null
  parentSessionId?: string | null
  body: string
  author: string
}
