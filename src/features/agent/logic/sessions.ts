import { isTextUIPart } from 'ai'
import { createLocalStorageStore } from '#/lib/local-storage-store'
import type { LoupeAgentUIMessage } from '../server/agent'

export interface StoredSession {
  id: string
  title: string
  updatedAt: number
  messages: LoupeAgentUIMessage[]
}

interface SessionsState {
  activeId: string
  sessions: StoredSession[]
}

const KEY = 'agent-sessions'
const MAX = 50
const store = createLocalStorageStore(KEY)

const newId = () => crypto.randomUUID()

// Only the list persists; activeId is per-page-load, so a refresh starts fresh (history keeps the rest).
let activeId = ''
let sessions: StoredSession[] | null = null
let snap: SessionsState | null = null

function readSessions(): StoredSession[] {
  try {
    const parsed = JSON.parse(window.localStorage.getItem(KEY) ?? '{}') as { sessions?: StoredSession[] }
    return Array.isArray(parsed.sessions) ? parsed.sessions : []
  } catch {
    return []
  }
}

function ensure() {
  if (sessions === null) sessions = readSessions()
  if (!activeId) activeId = newId()
  if (!snap) snap = { activeId, sessions }
}

function refresh() {
  snap = { activeId, sessions: sessions ?? [] }
  store.notify()
}

function writeSessions() {
  window.localStorage.setItem(KEY, JSON.stringify({ sessions }))
}

const SERVER: SessionsState = { activeId: '', sessions: [] }

export const sessionStore = {
  // Invalidate on every notify so a cross-tab 'storage' event re-reads the list
  // (the writing tab already updated its own module state before notifying).
  subscribe: (cb: () => void) =>
    store.subscribe(() => {
      sessions = null
      snap = null
      cb()
    }),
  getSnapshot: () => {
    ensure()
    return snap as SessionsState
  },
  getServerSnapshot: () => SERVER,
}

function titleFrom(messages: LoupeAgentUIMessage[]): string {
  const text = messages
    .find((m) => m.role === 'user')
    ?.parts.filter(isTextUIPart)
    .map((p) => p.text)
    .join(' ')
    .trim()
  if (!text) return 'New chat'
  return text.length > 60 ? `${text.slice(0, 60)}…` : text
}

export function loadSession(id: string): LoupeAgentUIMessage[] {
  ensure()
  return (sessions as StoredSession[]).find((s) => s.id === id)?.messages ?? []
}

export function saveSession({ sessionId, messages }: { sessionId: string; messages: LoupeAgentUIMessage[] }) {
  if (!messages.length) return
  ensure()
  const entry: StoredSession = { id: sessionId, title: titleFrom(messages), updatedAt: Date.now(), messages }
  sessions = [entry, ...(sessions as StoredSession[]).filter((s) => s.id !== sessionId)].slice(0, MAX)
  writeSessions()
  refresh()
}

export function newSession() {
  ensure()
  // Already on a fresh, unsaved session — nothing to reset.
  if (!(sessions as StoredSession[]).some((s) => s.id === activeId)) return
  activeId = newId()
  refresh()
}

export function selectSession(id: string) {
  ensure()
  activeId = id
  refresh()
}

export function deleteSession(id: string) {
  ensure()
  sessions = (sessions as StoredSession[]).filter((s) => s.id !== id)
  if (id === activeId) activeId = newId()
  writeSessions()
  refresh()
}
