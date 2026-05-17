import { Cog6ToothIcon, ComputerDesktopIcon, UserCircleIcon, XMarkIcon } from '@heroicons/react/16/solid'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import { StatusPills } from '#/components/status-pills'
import { Button } from '#/components/ui/button'
import { Dialog, DialogTitle } from '#/components/ui/dialog'
import { Input } from '#/components/ui/input'
import { type ThemeMode, useTheme } from '#/hooks/use-theme'
import { useUserId } from '#/hooks/use-user'
import { providersQuery, setProviderFn } from '#/lib/providers-data'
import { queryKeys } from '#/lib/query-keys'

const APP_VERSION = `v${__APP_VERSION__}`

type Section = 'general' | 'appearance' | 'account'

const SECTIONS: { value: Section; label: string; Icon: React.ComponentType<{ className?: string }> }[] = [
  { value: 'general', label: 'General', Icon: Cog6ToothIcon },
  { value: 'appearance', label: 'Appearance', Icon: ComputerDesktopIcon },
  { value: 'account', label: 'Account', Icon: UserCircleIcon },
]

interface SettingsDialogProps {
  open: boolean
  onClose: (open: boolean) => void
}

export function SettingsDialog({ open, onClose }: SettingsDialogProps) {
  const [section, setSection] = useState<Section>('general')

  return (
    <Dialog open={open} onClose={onClose} size="4xl">
      <div className="-m-(--gutter) flex min-h-[31rem] flex-col overflow-hidden">
        <header className="flex items-center justify-between border-b border-zinc-950/10 px-4 py-3 dark:border-white/10">
          <div className="flex min-w-0 items-center gap-2.5">
            <span className="flex size-8 shrink-0 items-center justify-center rounded-lg border border-zinc-950/10 bg-zinc-50 text-zinc-600 dark:border-white/10 dark:bg-white/[0.04] dark:text-zinc-300">
              <Cog6ToothIcon className="size-4 fill-current" />
            </span>
            <div className="min-w-0">
              <DialogTitle className="text-sm/5">Settings</DialogTitle>
              <p className="truncate text-xs text-zinc-500 dark:text-zinc-400">Workspace preferences and identity</p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => onClose(false)}
            aria-label="Close settings"
            className="inline-flex size-8 items-center justify-center rounded-md text-zinc-500 hover:bg-zinc-950/5 hover:text-zinc-950 dark:text-zinc-400 dark:hover:bg-white/10 dark:hover:text-white"
          >
            <XMarkIcon className="size-4 fill-current" />
          </button>
        </header>

        <div className="grid min-h-0 flex-1 grid-cols-1 sm:grid-cols-[13rem_1fr]">
          <aside className="border-b border-zinc-950/10 bg-zinc-50/70 px-3 py-3 sm:border-r sm:border-b-0 dark:border-white/10 dark:bg-zinc-950/25">
            <nav className="flex gap-1 overflow-x-auto sm:flex-col sm:overflow-visible" aria-label="Settings sections">
              {SECTIONS.map(({ value, label, Icon }) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setSection(value)}
                  className={[
                    'flex h-8 items-center gap-2 rounded-lg px-2.5 text-left text-xs font-medium whitespace-nowrap transition-colors',
                    section === value
                      ? 'bg-white text-zinc-950 shadow-xs ring-1 ring-zinc-950/8 dark:bg-white/10 dark:text-white dark:ring-white/10'
                      : 'text-zinc-600 hover:bg-white/70 hover:text-zinc-950 dark:text-zinc-400 dark:hover:bg-white/5 dark:hover:text-white',
                  ].join(' ')}
                >
                  <Icon
                    className={[
                      'size-4 shrink-0 fill-current',
                      section === value ? 'text-accent-600 dark:text-accent-300' : 'text-zinc-400 dark:text-zinc-500',
                    ].join(' ')}
                  />
                  <span>{label}</span>
                </button>
              ))}
            </nav>
          </aside>

          <div className="min-h-0 overflow-y-auto bg-white px-4 py-4 sm:px-5 dark:bg-zinc-900">
            {section === 'general' && <GeneralPane />}
            {section === 'appearance' && <AppearancePane />}
            {section === 'account' && <AccountPane />}
          </div>
        </div>
      </div>
    </Dialog>
  )
}

function PaneHeader({ title, description }: { title: string; description: string }) {
  return (
    <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 pb-4">
      <h2 className="text-sm font-semibold tracking-tight text-zinc-950 dark:text-white">{title}</h2>
      <p className="text-xs text-zinc-500 dark:text-zinc-400">{description}</p>
    </div>
  )
}

function SettingsGroup({ children }: { children: React.ReactNode }) {
  return (
    <div className="overflow-hidden rounded-xl border border-zinc-950/5 bg-white dark:border-white/8 dark:bg-zinc-900">
      <div className="divide-y divide-zinc-950/5 dark:divide-white/5">{children}</div>
    </div>
  )
}

function Row({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-3 px-4 py-3.5 sm:flex-row sm:items-center sm:justify-between sm:gap-6">
      <div className="min-w-0">
        <div className="text-xs font-medium text-zinc-950 dark:text-white">{label}</div>
        {hint && <div className="mt-0.5 text-[11px] text-zinc-500 dark:text-zinc-400">{hint}</div>}
      </div>
      <div className="min-w-0 overflow-x-auto sm:shrink-0">{children}</div>
    </div>
  )
}

function GeneralPane() {
  return (
    <div>
      <PaneHeader title="General" description="Runtime metadata and telemetry source" />
      <SettingsGroup>
        <Row label="Version">
          <code className="rounded bg-zinc-950/5 px-1.5 py-0.5 font-mono text-[11px] text-zinc-700 dark:bg-white/5 dark:text-zinc-300">
            {APP_VERSION}
          </code>
        </Row>
        <ProviderRow />
      </SettingsGroup>
    </div>
  )
}

type ProviderId = 'openobserve' | 'app-insights'

function ProviderRow() {
  const { data } = useQuery(providersQuery())
  const qc = useQueryClient()
  const mutation = useMutation({
    mutationFn: (id: ProviderId) => setProviderFn({ data: id }),
    onSuccess: async () => {
      await Promise.all([
        qc.invalidateQueries({ queryKey: queryKeys.providers.all() }),
        qc.invalidateQueries({ queryKey: queryKeys.sessions.all() }),
        qc.invalidateQueries({ queryKey: queryKeys.runs.all() }),
        qc.invalidateQueries({ queryKey: queryKeys.home.all() }),
        qc.invalidateQueries({ queryKey: queryKeys.inbox.all() }),
      ])
    },
  })

  const providers = data?.providers ?? []
  const active = (data?.active ?? 'openobserve') as ProviderId
  const missing = providers.find((p) => !p.configured)?.missing

  return (
    <Row
      label="Telemetry provider"
      hint={
        missing && missing.length > 0
          ? `Application Insights needs ${missing.join(', ')} in .env.`
          : 'Switch backends without restarting; persisted as a cookie.'
      }
    >
      <StatusPills
        value={active}
        onChange={(next) => {
          if (next !== active && !mutation.isPending) mutation.mutate(next as ProviderId)
        }}
        options={providers.map((p) => ({
          value: p.id,
          label: p.label,
          disabled: !p.configured,
          title: p.configured ? undefined : `Missing env: ${p.missing?.join(', ') ?? ''}`,
        }))}
      />
    </Row>
  )
}

function AppearancePane() {
  const { mode, toggle } = useTheme()
  const options: { value: ThemeMode; label: string }[] = [
    { value: 'light', label: 'Light' },
    { value: 'dark', label: 'Dark' },
  ]
  return (
    <div>
      <PaneHeader title="Appearance" description="Local display preferences" />
      <SettingsGroup>
        <Row label="Theme" hint="Persisted in localStorage.">
          <StatusPills
            value={mode}
            onChange={(next) => {
              if (next !== mode) toggle()
            }}
            options={options}
          />
        </Row>
      </SettingsGroup>
    </div>
  )
}

function AccountPane() {
  const [storedId, setStoredId] = useUserId()
  const [value, setValue] = useState(storedId)

  useEffect(() => {
    setValue(storedId)
  }, [storedId])

  const dirty = value.trim() !== storedId

  return (
    <div>
      <PaneHeader title="Account" description="Identity used to scope the sidebar's Recent list" />
      <SettingsGroup>
        <Row
          label="User ID"
          hint="Matched against user.id / enduser.id / ag_ui.user.id on emitted spans. Stored in your browser."
        >
          <div className="flex items-center gap-2">
            <Input
              type="text"
              value={value}
              onChange={(event) => setValue(event.target.value)}
              placeholder="you@example.com"
              className="w-56"
            />
            <Button onClick={() => setStoredId(value)} disabled={!dirty}>
              Save
            </Button>
          </div>
        </Row>
      </SettingsGroup>
    </div>
  )
}
