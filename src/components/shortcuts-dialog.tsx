import { createContext, type ReactNode, useContext, useEffect, useMemo, useState } from 'react'
import { type SearchProvider, useRegisterSearchProvider } from '#/components/command-palette'
import { CommandShortcut } from '#/components/ui/command'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '#/components/ui/dialog'
import { Kbd } from '#/components/ui/kbd'
import { formatShortcut, useIsMac } from '#/hooks/use-is-mac'

interface ShortcutRow {
  label: string
  keys: string[]
}

interface ShortcutGroup {
  heading: string
  rows: ShortcutRow[]
}

function buildGroups(isMac: boolean): ShortcutGroup[] {
  const mod = isMac ? '⌘' : 'Ctrl'
  return [
    {
      heading: 'Global',
      rows: [{ label: 'Open command palette', keys: [`${mod}+K`] }],
    },
    {
      heading: 'Session inspector',
      rows: [
        { label: 'Copy session ID', keys: [formatShortcut(isMac, 'Y')] },
        { label: 'Copy link', keys: [formatShortcut(isMac, 'L')] },
      ],
    },
  ]
}

interface ShortcutsCtx {
  open: boolean
  setOpen: (open: boolean) => void
}

const ShortcutsContext = createContext<ShortcutsCtx | null>(null)

export function useShortcutsDialog() {
  const ctx = useContext(ShortcutsContext)
  if (!ctx) throw new Error('useShortcutsDialog must be used inside <ShortcutsDialogProvider>')
  return ctx
}

export function ShortcutsDialogProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false)
  const isMac = useIsMac()

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== '?') return
      // Skip while typing in an input so '?' stays usable as text.
      const target = e.target as HTMLElement | null
      if (target) {
        const tag = target.tagName
        if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || target.isContentEditable) return
      }
      e.preventDefault()
      setOpen((prev) => !prev)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const groups = useMemo(() => buildGroups(isMac), [isMac])
  const value = useMemo<ShortcutsCtx>(() => ({ open, setOpen }), [open])

  const provider = useMemo<SearchProvider>(
    () => ({
      id: 'shortcuts',
      group: 'Help',
      items: [
        {
          id: 'open-shortcuts',
          label: 'Keyboard shortcuts',
          keywords: 'shortcuts hotkeys keys help cheatsheet',
          trailing: <CommandShortcut>?</CommandShortcut>,
          onSelect: () => setOpen(true),
        },
      ],
    }),
    [],
  )
  useRegisterSearchProvider(provider)

  return (
    <ShortcutsContext.Provider value={value}>
      {children}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Keyboard shortcuts</DialogTitle>
            <DialogDescription className="sr-only">
              A list of keyboard shortcuts available in the app.
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-5">
            {groups.map((group) => (
              <ShortcutGroupRow key={group.heading} group={group} />
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </ShortcutsContext.Provider>
  )
}

function ShortcutGroupRow({ group }: { group: ShortcutGroup }) {
  return (
    <section className="flex flex-col gap-1">
      <h3 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{group.heading}</h3>
      <ul className="flex flex-col">
        {group.rows.map((row) => (
          <li
            key={row.label}
            className="flex items-center justify-between py-1.5 text-sm border-b border-border/40 last:border-b-0"
          >
            <span>{row.label}</span>
            <span className="flex items-center gap-1">
              {row.keys.map((k) => (
                <Kbd key={k}>{k}</Kbd>
              ))}
            </span>
          </li>
        ))}
      </ul>
    </section>
  )
}
