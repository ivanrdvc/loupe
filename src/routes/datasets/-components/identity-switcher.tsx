import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Check, KeyRound, Plus, Settings2, Trash2, UserRound } from 'lucide-react'
import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { Button } from '#/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '#/components/ui/dialog'
import { Input } from '#/components/ui/input'
import { Label } from '#/components/ui/label'
import { Popover, PopoverContent, PopoverTrigger } from '#/components/ui/popover'
import { Textarea } from '#/components/ui/textarea'
import { type AgentIdentityConfig, type AgentIdentitySummary, agentIdentitiesQuery } from '#/features/evaluation'
import { deleteAgentIdentity, upsertAgentIdentity } from '#/features/evaluation/server/agent-identities'
import { errMessage } from '#/lib/format'
import { queryKeys } from '#/lib/query-keys'
import { ACCENT, type AccentFamily } from '#/lib/tone'
import { cn } from '#/lib/utils'

const DOT_FAMILIES: AccentFamily[] = ['violet', 'emerald', 'sky', 'amber', 'rose', 'blue', 'teal', 'pink']

// Stable per-identity dot color so "User B" is always the same hue across reloads.
function dotFamily(id: string): AccentFamily {
  let h = 0
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0
  return DOT_FAMILIES[h % DOT_FAMILIES.length]
}

export type IdentitySelection = { kind: 'none' } | { kind: 'identity'; id: string } | { kind: 'adhoc'; token: string }

function Dot({ family, dashed }: { family?: AccentFamily; dashed?: boolean }) {
  return (
    <span
      className={cn(
        'size-2 rounded-full',
        dashed ? 'border border-dashed border-muted-foreground bg-transparent' : family && ACCENT[family].solid,
      )}
    />
  )
}

// Persistent, colored chip that IS the user switcher (click → pick → done).
export function IdentitySwitcher({
  selection,
  onSelect,
}: {
  selection: IdentitySelection
  onSelect: (s: IdentitySelection) => void
}) {
  const { data: identities } = useQuery(agentIdentitiesQuery)
  const [open, setOpen] = useState(false)
  const [manageOpen, setManageOpen] = useState(false)
  const [adHocOpen, setAdHocOpen] = useState(false)

  useEffect(() => {
    if (identities && selection.kind === 'identity' && !identities.some((identity) => identity.id === selection.id)) {
      onSelect({ kind: 'none' })
    }
  }, [identities, onSelect, selection])

  const availableIdentities = identities ?? []
  const active = selection.kind === 'identity' ? availableIdentities.find((i) => i.id === selection.id) : null
  const label =
    selection.kind === 'adhoc'
      ? 'Ad-hoc token'
      : selection.kind === 'identity'
        ? (active?.label ?? 'Unknown')
        : 'No auth'

  return (
    <>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button variant="outline" size="sm" className="h-8 justify-start gap-2 font-normal">
            {selection.kind === 'adhoc' ? (
              <Dot dashed />
            ) : selection.kind === 'identity' ? (
              <Dot family={active ? dotFamily(active.id) : undefined} />
            ) : (
              <span className="size-2 rounded-full bg-muted-foreground/40" />
            )}
            <span className="truncate">{label}</span>
          </Button>
        </PopoverTrigger>
        <PopoverContent align="start" className="w-64 p-1">
          <Row
            icon={<span className="size-2 rounded-full bg-muted-foreground/40" />}
            label="No auth"
            selected={selection.kind === 'none'}
            onClick={() => {
              onSelect({ kind: 'none' })
              setOpen(false)
            }}
          />
          {availableIdentities.map((i) => (
            <Row
              key={i.id}
              icon={<Dot family={dotFamily(i.id)} />}
              label={i.label}
              selected={selection.kind === 'identity' && selection.id === i.id}
              onClick={() => {
                onSelect({ kind: 'identity', id: i.id })
                setOpen(false)
              }}
            />
          ))}
          <Row
            icon={<Dot dashed />}
            label="Ad-hoc token…"
            selected={selection.kind === 'adhoc'}
            onClick={() => {
              setOpen(false)
              setAdHocOpen(true)
            }}
          />
          <div className="my-1 border-t" />
          <Row
            icon={<Settings2 className="size-3.5 text-muted-foreground" />}
            label="Manage users…"
            onClick={() => {
              setOpen(false)
              setManageOpen(true)
            }}
          />
        </PopoverContent>
      </Popover>

      <AdHocDialog
        open={adHocOpen}
        initial={selection.kind === 'adhoc' ? selection.token : ''}
        onOpenChange={setAdHocOpen}
        onSave={(token) => onSelect(token ? { kind: 'adhoc', token } : { kind: 'none' })}
      />
      <ManageDialog open={manageOpen} onOpenChange={setManageOpen} identities={availableIdentities} />
    </>
  )
}

function Row({
  icon,
  label,
  selected,
  onClick,
}: {
  icon: React.ReactNode
  label: string
  selected?: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-muted/60"
    >
      {icon}
      <span className="flex-1 truncate">{label}</span>
      {selected && <Check className="size-3.5 text-muted-foreground" />}
    </button>
  )
}

function AdHocDialog({
  open,
  initial,
  onOpenChange,
  onSave,
}: {
  open: boolean
  initial: string
  onOpenChange: (v: boolean) => void
  onSave: (token: string) => void
}) {
  const [token, setToken] = useState(initial)
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <KeyRound className="size-4" /> Ad-hoc token
          </DialogTitle>
          <DialogDescription>
            Sent as <code>Authorization: Bearer …</code> until changed or the page reloads. Never saved or written to a
            run record.
          </DialogDescription>
        </DialogHeader>
        <Textarea
          value={token}
          onChange={(e) => setToken(e.target.value)}
          placeholder="Paste a bearer token…"
          className="min-h-24 font-mono text-xs"
        />
        <DialogFooter>
          <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            size="sm"
            onClick={() => {
              onSave(token.trim())
              onOpenChange(false)
            }}
          >
            Use token
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

const CONFIG_PLACEHOLDER = `{
  "credentials": { "username": "userB", "password": "…" },
  "entityId": "company-a/user-b",
  "authEndpoint": "(override the target's, only if needed)"
}`

// Minimal roster: list + add + delete. Add defaults to username/password; a Full-config
// toggle exposes raw JSON for overriding the target's handshake.
function ManageDialog({
  open,
  onOpenChange,
  identities,
}: {
  open: boolean
  onOpenChange: (v: boolean) => void
  identities: AgentIdentitySummary[]
}) {
  const queryClient = useQueryClient()
  const [mode, setMode] = useState<'simple' | 'full'>('simple')
  const [label, setLabel] = useState('')
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [config, setConfig] = useState('')
  const invalidate = () => queryClient.invalidateQueries({ queryKey: queryKeys.datasets.identities() })

  const addMutation = useMutation({
    mutationFn: (vars: { label: string; config: AgentIdentityConfig }) => upsertAgentIdentity({ data: vars }),
    onSuccess: async () => {
      await invalidate()
      setLabel('')
      setUsername('')
      setPassword('')
      setConfig('')
      toast.success('Identity added')
      onOpenChange(false)
    },
    onError: (err) => toast.error(errMessage(err)),
  })

  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteAgentIdentity({ data: { id } }),
    onSuccess: async () => {
      await invalidate()
      toast.success('Identity removed')
    },
    onError: (err) => toast.error(errMessage(err)),
  })

  const add = () => {
    if (!label.trim()) return toast.error('Label is required')
    let parsed: AgentIdentityConfig = {}
    if (mode === 'simple') {
      if (!username.trim()) return toast.error('Username is required')
      parsed = { credentials: { username: username.trim(), password } }
    } else if (config.trim()) {
      try {
        parsed = JSON.parse(config) as AgentIdentityConfig
      } catch {
        return toast.error('Config must be valid JSON')
      }
    }
    addMutation.mutate({ label: label.trim(), config: parsed })
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <UserRound className="size-4" /> Dev users
          </DialogTitle>
          <DialogDescription>
            Identities the runner authenticates as. Plaintext dev creds are fine here; the minted token is never stored.
          </DialogDescription>
        </DialogHeader>

        {identities.length > 0 && (
          <ul className="flex flex-col divide-y rounded-md border">
            {identities.map((i) => (
              <li key={i.id} className="flex items-center gap-2 px-3 py-2">
                <Dot family={dotFamily(i.id)} />
                <span className="flex-1 truncate text-sm">{i.label}</span>
                <span className="truncate font-mono text-[11px] text-muted-foreground">
                  {i.username ?? 'custom config'}
                </span>
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-7 text-muted-foreground hover:text-destructive"
                  onClick={() => deleteMutation.mutate(i.id)}
                >
                  <Trash2 className="size-4" />
                </Button>
              </li>
            ))}
          </ul>
        )}

        <div className="flex flex-col gap-2 rounded-md border bg-muted/20 p-3">
          <div className="flex items-center justify-between">
            <Label htmlFor="identity-label" className="text-xs">
              Label
            </Label>
            <div className="flex gap-1">
              <ModeButton active={mode === 'simple'} onClick={() => setMode('simple')}>
                User / pw
              </ModeButton>
              <ModeButton active={mode === 'full'} onClick={() => setMode('full')}>
                Full config
              </ModeButton>
            </div>
          </div>
          <Input
            id="identity-label"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder="Company A / User B"
            className="h-8"
          />
          {mode === 'simple' ? (
            <div className="grid grid-cols-2 gap-2">
              <Input
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="Username"
                className="h-8"
              />
              <Input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Password"
                className="h-8"
              />
            </div>
          ) : (
            <Textarea
              id="identity-config"
              value={config}
              onChange={(e) => setConfig(e.target.value)}
              placeholder={CONFIG_PLACEHOLDER}
              className="min-h-32 font-mono text-xs"
            />
          )}
          <Button size="sm" className="self-end" disabled={addMutation.isPending} onClick={add}>
            <Plus data-icon="inline-start" />
            Add user
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}

function ModeButton({
  active,
  onClick,
  children,
}: {
  active: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'rounded px-2 py-0.5 text-[11px]',
        active ? 'bg-foreground text-background' : 'text-muted-foreground hover:bg-muted',
      )}
    >
      {children}
    </button>
  )
}

// Persisted run selection (localStorage), like autoJudge. Ad-hoc tokens are never persisted.
const STORAGE_KEY = 'datasets:identitySelection'

export function loadIdentitySelection(): IdentitySelection {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return { kind: 'none' }
    const parsed = JSON.parse(raw)
    if (parsed?.kind === 'identity' && typeof parsed.id === 'string') return parsed
  } catch {}
  return { kind: 'none' }
}

export function saveIdentitySelection(s: IdentitySelection): void {
  // Only saved identities persist; an ad-hoc token must be re-entered each session.
  if (s.kind === 'identity') window.localStorage.setItem(STORAGE_KEY, JSON.stringify(s))
  else window.localStorage.removeItem(STORAGE_KEY)
}
