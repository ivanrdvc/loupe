import { useCallback, useSyncExternalStore } from 'react'

const STORAGE_PREFIX = 'agentops:session-note:'
const CHANGE_EVENT = 'agentops:session-note:change'
const listeners = new Set<() => void>()

interface StoredNote {
  body: string
  updatedAt: number
}

function emitChange(sessionId: string) {
  for (const listener of listeners) listener()
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent(CHANGE_EVENT, { detail: { sessionId } }))
  }
}

function subscribe(cb: () => void) {
  listeners.add(cb)
  const onStorage = (event: StorageEvent) => {
    if (event.key?.startsWith(STORAGE_PREFIX)) cb()
  }
  const onCustom = () => cb()
  if (typeof window !== 'undefined') {
    window.addEventListener('storage', onStorage)
    window.addEventListener(CHANGE_EVENT, onCustom)
  }
  return () => {
    listeners.delete(cb)
    if (typeof window !== 'undefined') {
      window.removeEventListener('storage', onStorage)
      window.removeEventListener(CHANGE_EVENT, onCustom)
    }
  }
}

function readNote(sessionId: string): StoredNote | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = window.localStorage.getItem(STORAGE_PREFIX + sessionId)
    if (!raw) return null
    return JSON.parse(raw) as StoredNote
  } catch {
    return null
  }
}

export interface SessionNoteApi {
  body: string
  updatedAt: number | null
  setBody: (body: string) => void
  clear: () => void
}

export function useSessionNote(sessionId: string): SessionNoteApi {
  const note = useSyncExternalStore(
    subscribe,
    useCallback(() => readNote(sessionId), [sessionId]),
    () => null,
  )

  const setBody = useCallback(
    (body: string) => {
      if (typeof window === 'undefined') return
      const trimmed = body
      if (trimmed) {
        const stored: StoredNote = { body: trimmed, updatedAt: Date.now() }
        window.localStorage.setItem(STORAGE_PREFIX + sessionId, JSON.stringify(stored))
      } else {
        window.localStorage.removeItem(STORAGE_PREFIX + sessionId)
      }
      emitChange(sessionId)
    },
    [sessionId],
  )

  const clear = useCallback(() => {
    if (typeof window === 'undefined') return
    window.localStorage.removeItem(STORAGE_PREFIX + sessionId)
    emitChange(sessionId)
  }, [sessionId])

  return {
    body: note?.body ?? '',
    updatedAt: note?.updatedAt ?? null,
    setBody,
    clear,
  }
}

export function hasSessionNote(sessionId: string): boolean {
  return readNote(sessionId) !== null
}
