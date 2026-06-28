import * as React from 'react'
import { createLocalStorageStore } from '#/lib/local-storage-store'

const STORAGE_KEY = 'agent-enabled'
const store = createLocalStorageStore(STORAGE_KEY)
const readEnabled = () => typeof window !== 'undefined' && window.localStorage.getItem(STORAGE_KEY) === '1'

type AgentContextValue = {
  /**
   * Feature flag; persisted per browser. Toggle from /admin (temp, see TODO.md).
   */
  enabled: boolean
  setEnabled: (enabled: boolean) => void
  open: boolean
  setOpen: (open: boolean) => void
}

const AgentContext = React.createContext<AgentContextValue | null>(null)

export function useAgent() {
  const ctx = React.useContext(AgentContext)
  if (!ctx) throw new Error('useAgent must be used within an AgentProvider.')
  return ctx
}

export function AgentProvider({ children }: { children: React.ReactNode }) {
  const enabled = React.useSyncExternalStore(store.subscribe, readEnabled, () => false)
  const [open, setOpen] = React.useState(false)

  const setEnabled = React.useCallback((next: boolean) => {
    window.localStorage.setItem(STORAGE_KEY, next ? '1' : '0')
    store.notify()
    if (!next) setOpen(false)
  }, [])

  const value = React.useMemo(() => ({ enabled, setEnabled, open, setOpen }), [enabled, setEnabled, open])
  return <AgentContext.Provider value={value}>{children}</AgentContext.Provider>
}
