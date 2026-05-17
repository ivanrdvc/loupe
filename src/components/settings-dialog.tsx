import { ComputerIcon, Moon01Icon, Sun01Icon, Tick02Icon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useTheme } from 'next-themes'
import { useEffect, useState } from 'react'
import { Button } from '#/components/ui/button'
import { Input } from '#/components/ui/input'
import { Label } from '#/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '#/components/ui/select'
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '#/components/ui/sheet'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '#/components/ui/tabs'
import { ACCENTS, type ThemeAccent, useThemeAccent } from '#/hooks/use-theme-accent'
import { useUserId } from '#/hooks/use-user'
import { providersQuery, setProviderFn } from '#/lib/providers-data'
import { queryKeys } from '#/lib/query-keys'
import { cn } from '#/lib/utils'

const APP_VERSION = `v${__APP_VERSION__}`

interface SettingsDialogProps {
  open: boolean
  onClose: (open: boolean) => void
}

export function SettingsDialog({ open, onClose }: SettingsDialogProps) {
  return (
    <Sheet open={open} onOpenChange={onClose}>
      <SheetContent side="right" className="w-full gap-0 p-0 sm:max-w-md">
        <SheetHeader className="border-b">
          <SheetTitle>Settings</SheetTitle>
          <SheetDescription>Workspace preferences and identity</SheetDescription>
        </SheetHeader>

        <Tabs defaultValue="appearance" className="flex h-full min-h-0 flex-1 flex-col gap-0">
          <TabsList variant="line" className="h-9 w-full justify-start gap-3 border-b px-6">
            <TabsTrigger value="account">Account</TabsTrigger>
            <TabsTrigger value="appearance">Appearance</TabsTrigger>
            <TabsTrigger value="general">General</TabsTrigger>
          </TabsList>

          <div className="flex-1 overflow-y-auto px-6 py-5">
            <TabsContent value="account" className="mt-0">
              <AccountPane />
            </TabsContent>
            <TabsContent value="appearance" className="mt-0">
              <AppearancePane />
            </TabsContent>
            <TabsContent value="general" className="mt-0">
              <GeneralPane />
            </TabsContent>
          </div>
        </Tabs>
      </SheetContent>
    </Sheet>
  )
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="grid gap-2">
      <div>
        <Label className="text-xs font-medium text-foreground">{label}</Label>
        {hint ? <p className="mt-0.5 text-[11px] text-muted-foreground">{hint}</p> : null}
      </div>
      {children}
    </div>
  )
}

const MODES = [
  { value: 'light', label: 'Light', icon: Sun01Icon },
  { value: 'dark', label: 'Dark', icon: Moon01Icon },
  { value: 'system', label: 'System', icon: ComputerIcon },
] as const

const ACCENT_SWATCH: Record<ThemeAccent, string> = {
  default: 'oklch(0.525 0.223 3.958)',
  blue: 'var(--color-blue-600)',
  green: 'var(--color-lime-600)',
  amber: 'var(--color-amber-600)',
  rose: 'var(--color-rose-600)',
  purple: 'var(--color-purple-600)',
  orange: 'var(--color-orange-600)',
  teal: 'var(--color-teal-600)',
  red: 'var(--color-red-600)',
  yellow: 'var(--color-yellow-400)',
  violet: 'var(--color-violet-600)',
}

function AppearancePane() {
  const { theme, setTheme } = useTheme()
  const { accent, setAccent } = useThemeAccent()
  const activeMode = theme ?? 'dark'

  return (
    <div className="space-y-6">
      <Field label="Theme" hint="Light, dark, or follow your system preference.">
        <div className="grid grid-cols-3 gap-2">
          {MODES.map(({ value, label, icon }) => {
            const isActive = activeMode === value
            return (
              <button
                key={value}
                type="button"
                onClick={() => setTheme(value)}
                aria-pressed={isActive}
                className={cn(
                  'flex flex-col items-center gap-1.5 rounded-md border border-input bg-input/20 px-2 py-3 text-xs font-medium transition-colors hover:bg-input/40 dark:bg-input/30',
                  isActive && 'border-ring bg-input/60 text-foreground ring-2 ring-ring/30 dark:bg-input/60',
                )}
              >
                <HugeiconsIcon icon={icon} className="size-4" />
                <span>{label}</span>
              </button>
            )
          })}
        </div>
      </Field>

      <Field label="Accent" hint="Color of buttons, focus rings, and the active sidebar item.">
        <div className="grid grid-cols-6 gap-2">
          {ACCENTS.map((a) => {
            const isActive = accent === a
            return (
              <button
                key={a}
                type="button"
                onClick={() => setAccent(a)}
                title={a}
                aria-pressed={isActive}
                className={cn(
                  'group flex aspect-square items-center justify-center rounded-md border border-input bg-input/20 transition-all hover:scale-105 hover:bg-input/40 dark:bg-input/30',
                  isActive && 'border-ring ring-2 ring-ring/40',
                )}
              >
                <span
                  className="flex size-5 items-center justify-center rounded-full"
                  style={{ backgroundColor: ACCENT_SWATCH[a] }}
                >
                  {isActive ? <HugeiconsIcon icon={Tick02Icon} className="size-3 text-white" strokeWidth={3} /> : null}
                </span>
              </button>
            )
          })}
        </div>
      </Field>
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
    <Field
      label="User ID"
      hint="Matched against user.id / enduser.id / ag_ui.user.id on emitted spans. Stored in your browser."
    >
      <div className="flex items-center gap-2">
        <Input
          type="text"
          value={value}
          onChange={(event) => setValue(event.target.value)}
          placeholder="you@example.com"
          className="flex-1"
        />
        <Button onClick={() => setStoredId(value)} disabled={!dirty}>
          Save
        </Button>
      </div>
    </Field>
  )
}

type ProviderId = 'openobserve' | 'app-insights'

function GeneralPane() {
  return (
    <div className="space-y-6">
      <Field label="Version">
        <code className="inline-flex w-fit items-center rounded bg-muted px-1.5 py-0.5 font-mono text-[11px] text-muted-foreground">
          {APP_VERSION}
        </code>
      </Field>
      <ProviderRow />
    </div>
  )
}

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
    <Field
      label="Telemetry provider"
      hint={
        missing && missing.length > 0
          ? `Application Insights needs ${missing.join(', ')} in .env.`
          : 'Switch backends without restarting; persisted as a cookie.'
      }
    >
      <Select
        value={active}
        onValueChange={(next) => {
          if (next !== active && !mutation.isPending) mutation.mutate(next as ProviderId)
        }}
      >
        <SelectTrigger className="w-full">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {providers.map((p) => (
            <SelectItem key={p.id} value={p.id} disabled={!p.configured}>
              {p.label}
              {!p.configured && p.missing?.length ? (
                <span className="ml-2 text-muted-foreground">(missing {p.missing.join(', ')})</span>
              ) : null}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </Field>
  )
}
