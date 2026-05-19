import { ComputerIcon, Moon01Icon, Sun01Icon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useTheme } from 'next-themes'
import { useEffect, useState } from 'react'
import { providersQuery, setProviderFn } from '#/components/settings-data'
import { Button } from '#/components/ui/button'
import { Input } from '#/components/ui/input'
import { Label } from '#/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '#/components/ui/select'
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '#/components/ui/sheet'
import { Switch } from '#/components/ui/switch'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '#/components/ui/tabs'
import { type AppFont, type ColorTheme, useAppTheme } from '#/hooks/use-app-theme'
import { useScopeToMe, useUserId } from '#/hooks/use-user'
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
        <Label className="font-medium text-foreground">{label}</Label>
        {hint ? <p className="mt-0.5 text-xs text-muted-foreground">{hint}</p> : null}
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

const COLORS: { value: ColorTheme; label: string; dot: string }[] = [
  { value: 'pink-mauve', label: 'Pink Mauve', dot: 'oklch(0.525 0.223 3.958)' },
  { value: 'violet', label: 'Violet', dot: 'oklch(0.4597 0.0629 289.5561)' },
  { value: 'lavender', label: 'Lavender', dot: 'oklch(0.6104 0.0767 299.7335)' },
]

const FONTS: { value: AppFont; label: string; family: string }[] = [
  { value: 'pretendard', label: 'Pretendard', family: "'Pretendard Variable', sans-serif" },
  { value: 'inter', label: 'Inter', family: "'Inter Variable', sans-serif" },
]

const TILE_BASE =
  'flex items-center gap-2 rounded-md border border-input bg-input/20 px-3 py-2 text-sm font-medium transition-colors hover:bg-input/40 dark:bg-input/30'
const TILE_ACTIVE = 'border-ring bg-input/60 text-foreground ring-2 ring-ring/30 dark:bg-input/60'

function AppearancePane() {
  const { theme, setTheme } = useTheme()
  const activeMode = theme ?? 'dark'
  const { colorTheme, setColorTheme, font, setFont } = useAppTheme()

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
                  isActive && TILE_ACTIVE,
                )}
              >
                <HugeiconsIcon icon={icon} className="size-4" />
                <span>{label}</span>
              </button>
            )
          })}
        </div>
      </Field>

      <Field label="Color" hint="Accent palette. Switches apply instantly and persist in this browser.">
        <div className="grid grid-cols-2 gap-2">
          {COLORS.map(({ value, label, dot }) => {
            const isActive = colorTheme === value
            return (
              <button
                key={value}
                type="button"
                onClick={() => setColorTheme(value)}
                aria-pressed={isActive}
                className={cn(TILE_BASE, isActive && TILE_ACTIVE)}
              >
                <span className="size-3.5 shrink-0 rounded-full border border-border/40" style={{ background: dot }} />
                <span>{label}</span>
              </button>
            )
          })}
        </div>
      </Field>

      <Field label="Font">
        <div className="grid grid-cols-2 gap-2">
          {FONTS.map(({ value, label, family }) => {
            const isActive = font === value
            return (
              <button
                key={value}
                type="button"
                onClick={() => setFont(value)}
                aria-pressed={isActive}
                className={cn(TILE_BASE, 'justify-between', isActive && TILE_ACTIVE)}
              >
                <span>{label}</span>
                <span className="text-base text-muted-foreground" style={{ fontFamily: family }}>
                  Aa
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
  const [scopeToMe, setScopeToMe] = useScopeToMe()

  useEffect(() => {
    setValue(storedId)
  }, [storedId])

  const dirty = value.trim() !== storedId

  return (
    <div className="space-y-6">
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

      <Field label="Scope to me" hint="Filter Traces and Sessions to your user id only. Off shows everything.">
        <div className="flex items-center gap-3">
          <Switch
            checked={scopeToMe}
            onCheckedChange={setScopeToMe}
            disabled={!storedId}
            aria-label="Scope list views to my user id"
          />
          <span className="text-sm text-muted-foreground">
            {!storedId
              ? 'Set a user id above first.'
              : scopeToMe
                ? 'On — list views are filtered.'
                : 'Off — showing everything.'}
          </span>
        </div>
      </Field>
    </div>
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
        qc.invalidateQueries({ queryKey: queryKeys.traces.all() }),
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
