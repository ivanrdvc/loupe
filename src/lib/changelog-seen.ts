// Last changelog version the user opened, as an external store so the sidebar dot
// and changelog page stay in sync within the tab and across tabs.

const STORAGE_KEY = 'changelog-last-seen-version'
const EVENT = 'changelog-seen-change'

export function getChangelogLastSeen(): string | null {
  if (typeof window === 'undefined') return null
  return window.localStorage.getItem(STORAGE_KEY)
}

export function markChangelogSeen(version: string): void {
  if (typeof window === 'undefined') return
  if (window.localStorage.getItem(STORAGE_KEY) === version) return
  window.localStorage.setItem(STORAGE_KEY, version)
  window.dispatchEvent(new Event(EVENT))
}

export function subscribeChangelogSeen(onChange: () => void): () => void {
  if (typeof window === 'undefined') return () => {}
  window.addEventListener(EVENT, onChange) // same-tab writes
  window.addEventListener('storage', onChange) // other tabs
  return () => {
    window.removeEventListener(EVENT, onChange)
    window.removeEventListener('storage', onChange)
  }
}
