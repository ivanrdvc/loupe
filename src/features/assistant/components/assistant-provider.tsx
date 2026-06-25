import * as React from 'react'

const STORAGE_KEY = 'assistant-enabled'

type AssistantContextValue = {
  /** Feature flag; persisted per browser. Toggle from /admin (temp). */
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
  const [enabled, setEnabledState] = React.useState(false)
  const [open, setOpen] = React.useState(false)

  React.useEffect(() => {
    try {
      setEnabledState(localStorage.getItem(STORAGE_KEY) === '1')
    } catch {}
    const onStorage = (e: StorageEvent) => {
      if (e.key === STORAGE_KEY) setEnabledState(e.newValue === '1')
    }
    window.addEventListener('storage', onStorage)
    return () => window.removeEventListener('storage', onStorage)
  }, [])

  const setEnabled = React.useCallback((next: boolean) => {
    setEnabledState(next)
    try {
      localStorage.setItem(STORAGE_KEY, next ? '1' : '0')
    } catch {}
    if (!next) setOpen(false)
  }, [])

  const value = React.useMemo(() => ({ enabled, setEnabled, open, setOpen }), [enabled, setEnabled, open])
  return <AssistantContext.Provider value={value}>{children}</AssistantContext.Provider>
}
