import {
  Edit02Icon,
  Home01Icon,
  InboxIcon,
  MessageMultiple01Icon,
  PlayCircleIcon,
  PuzzleIcon,
  StickyNote01Icon,
  TestTubeIcon,
} from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { IconSearch } from '@tabler/icons-react'
import { useNavigate } from '@tanstack/react-router'
import { createContext, Fragment, type ReactNode, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { Button } from '#/components/ui/button'
import {
  Command,
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from '#/components/ui/command'

type NavTo = '/' | '/sessions' | '/traces' | '/mcp' | '/notes' | '/prompts' | '/evals' | '/inbox'

const NAV_ITEMS: { to: NavTo; label: string; icon: typeof Home01Icon }[] = [
  { to: '/', label: 'Home', icon: Home01Icon },
  { to: '/sessions', label: 'Sessions', icon: MessageMultiple01Icon },
  { to: '/traces', label: 'Traces', icon: PlayCircleIcon },
  { to: '/mcp', label: 'MCP', icon: PuzzleIcon },
  { to: '/notes', label: 'Notes', icon: StickyNote01Icon },
  { to: '/prompts', label: 'Prompts', icon: Edit02Icon },
  { to: '/evals', label: 'Evals', icon: TestTubeIcon },
  { to: '/inbox', label: 'Inbox', icon: InboxIcon },
]

export interface SearchItem {
  id: string
  label: string
  keywords?: string
  leading?: ReactNode
  trailing?: ReactNode
  onSelect: () => void
}

export interface SearchProvider {
  id: string
  group: string
  items: SearchItem[]
}

interface PaletteCtx {
  open: boolean
  setOpen: (open: boolean) => void
  registerProvider: (provider: SearchProvider) => () => void
}

const PaletteContext = createContext<PaletteCtx | null>(null)

export function useCommandPalette() {
  const ctx = useContext(PaletteContext)
  if (!ctx) throw new Error('useCommandPalette must be used inside <CommandPaletteProvider>')
  return ctx
}

export function useRegisterSearchProvider(provider: SearchProvider | null) {
  const { registerProvider } = useCommandPalette()
  useEffect(() => {
    if (!provider) return
    return registerProvider(provider)
  }, [provider, registerProvider])
}

export function CommandPaletteProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false)
  const [providers, setProviders] = useState<Record<string, SearchProvider>>({})

  const registerProvider = useCallback((provider: SearchProvider) => {
    setProviders((prev) => ({ ...prev, [provider.id]: provider }))
    return () => {
      setProviders((prev) => {
        if (!(provider.id in prev)) return prev
        const next = { ...prev }
        delete next[provider.id]
        return next
      })
    }
  }, [])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setOpen((prev) => !prev)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const value = useMemo<PaletteCtx>(() => ({ open, setOpen, registerProvider }), [open, registerProvider])

  return (
    <PaletteContext.Provider value={value}>
      {children}
      <CommandPaletteDialog providers={providers} />
    </PaletteContext.Provider>
  )
}

function CommandPaletteDialog({ providers }: { providers: Record<string, SearchProvider> }) {
  const { open, setOpen } = useCommandPalette()
  const navigate = useNavigate()

  const run = useCallback(
    (fn: () => void) => {
      fn()
      setOpen(false)
    },
    [setOpen],
  )

  const orderedProviders = useMemo(() => Object.values(providers).filter((p) => p.items.length > 0), [providers])

  return (
    <CommandDialog open={open} onOpenChange={setOpen} title="Search">
      <Command>
        <CommandInput placeholder="Search pages, spans…" />
        <CommandList>
          <CommandEmpty>No matches.</CommandEmpty>
          {orderedProviders.map((provider) => (
            <Fragment key={provider.id}>
              <CommandGroup heading={provider.group}>
                {provider.items.map((item) => (
                  <CommandItem
                    key={item.id}
                    value={`${item.id} ${item.label} ${item.keywords ?? ''}`}
                    onSelect={() => run(item.onSelect)}
                  >
                    {item.leading}
                    <span className="min-w-0 flex-1 truncate">{item.label}</span>
                    {item.trailing}
                  </CommandItem>
                ))}
              </CommandGroup>
              <CommandSeparator />
            </Fragment>
          ))}
          <CommandGroup heading="Navigation">
            {NAV_ITEMS.map((item) => (
              <CommandItem
                key={item.to}
                value={`${item.to} ${item.label}`}
                onSelect={() => run(() => navigate({ to: item.to }))}
              >
                <HugeiconsIcon icon={item.icon} />
                <span>{item.label}</span>
              </CommandItem>
            ))}
          </CommandGroup>
        </CommandList>
      </Command>
    </CommandDialog>
  )
}

function detectMac(): boolean {
  if (typeof navigator === 'undefined') return false
  const platform = (navigator as Navigator & { userAgentData?: { platform?: string } }).userAgentData?.platform
  const source = platform ?? navigator.platform ?? navigator.userAgent
  return source.toLowerCase().includes('mac')
}

export function CommandPaletteTrigger() {
  const { setOpen } = useCommandPalette()
  const [isMac, setIsMac] = useState(false)
  useEffect(() => {
    setIsMac(detectMac())
  }, [])
  return (
    <Button
      variant="link"
      onClick={() => setOpen(true)}
      className="gap-1.5 px-0! font-normal text-muted-foreground hover:no-underline"
    >
      <IconSearch data-icon="inline-start" />
      Search
      <kbd className="hidden h-5 select-none items-center gap-1 rounded border bg-muted px-1.5 font-medium text-[10px] sm:inline-flex">
        <span className="text-xs" suppressHydrationWarning>
          {isMac ? '⌘' : 'Ctrl'}
        </span>
        K
      </kbd>
    </Button>
  )
}
