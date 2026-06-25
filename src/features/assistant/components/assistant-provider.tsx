import * as React from 'react'
import { createLocalStorageStore } from '#/lib/local-storage-store'

const STORAGE_KEY = 'assistant-enabled'
const store = createLocalStorageStore(STORAGE_KEY)
const readEnabled = () => typeof window !== 'undefined' && window.localStorage.getItem(STORAGE_KEY) === '1'

type AssistantContextValue = {
  /** Feature flag; persisted per browser. Toggle from /admin (temp, see TODO.md). */
  enabled: boolean
  setEnabled: (enabled: boolean) => void
  open: boolean
  setOpen: (open: boolean) => void
}

const AssistantContext = React.createContext<AssistantContextValue | null>(null)

export function useAssistant() {
  const ctx = React.useContext(AssistantContext)
  if (!ctx) throw new Error('useAssistant must be used within an AssistantProvider.')
  return ctx
}

export function AssistantProvider({ children }: { children: React.ReactNode }) {
  const enabled = React.useSyncExternalStore(store.subscribe, readEnabled, () => false)
  const [open, setOpen] = React.useState(false)

  const setEnabled = React.useCallback((next: boolean) => {
    window.localStorage.setItem(STORAGE_KEY, next ? '1' : '0')
    store.notify()
    if (!next) setOpen(false)
  }, [])

  const value = React.useMemo(() => ({ enabled, setEnabled, open, setOpen }), [enabled, setEnabled, open])
  return <AssistantContext.Provider value={value}>{children}</AssistantContext.Provider>
}
