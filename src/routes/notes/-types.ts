export type NoteTargetKind = 'session' | 'trace' | 'span' | 'prompt' | 'experiment'

export type Note = {
  id: number
  targetKind: NoteTargetKind
  targetId: string
  body: string
  author: string
  createdAt: number
  updatedAt: number
}

export type UpsertNoteInput = {
  targetKind: NoteTargetKind
  targetId: string
  body: string
  author: string
}
