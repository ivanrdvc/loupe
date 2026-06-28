import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Plus, Server, Settings2, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'
import { Button } from '#/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '#/components/ui/dialog'
import { Input } from '#/components/ui/input'
import { Label } from '#/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '#/components/ui/select'
import { type AgentTarget, agentTargetsQuery, GLOBAL_DEFAULT_ENDPOINT } from '#/features/evaluation'
import { deleteAgentTarget, upsertAgentTarget } from '#/features/evaluation/server/agent-targets'
import { errMessage } from '#/lib/format'
import { queryKeys } from '#/lib/query-keys'
import { Field } from './run-bits'

const CUSTOM = '__custom__'

// Persisted target selection (localStorage). null = Custom URL.
const STORAGE_KEY = 'datasets:targetSelection'

export function loadTargetSelection(): string | null {
  try {
    return window.localStorage.getItem(STORAGE_KEY) || null
  } catch {
    return null
  }
}

export function saveTargetSelection(id: string | null): void {
  if (id) window.localStorage.setItem(STORAGE_KEY, id)
  else window.localStorage.removeItem(STORAGE_KEY)
}

// Saved-server dropdown + a Custom URL escape hatch.
export function TargetPicker({
  targetId,
  onTargetChange,
  endpoint,
  onEndpointChange,
  onEndpointCommit,
}: {
  targetId: string | null
  onTargetChange: (id: string | null) => void
  endpoint: string
  onEndpointChange: (v: string) => void
  onEndpointCommit: () => void
}) {
  const { data: targets = [] } = useQuery(agentTargetsQuery)
  const [manageOpen, setManageOpen] = useState(false)
  const isCustom = targetId == null

  return (
    <Field label="Target">
      <div className="flex gap-1.5">
        <Select value={targetId ?? CUSTOM} onValueChange={(v) => onTargetChange(v === CUSTOM ? null : v)}>
          <SelectTrigger className="h-8 flex-1 text-xs" aria-label="Target">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={CUSTOM}>Custom URL…</SelectItem>
            {targets.map((t) => (
              <SelectItem key={t.id} value={t.id}>
                {t.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button
          variant="outline"
          size="icon"
          className="size-8"
          onClick={() => setManageOpen(true)}
          aria-label="Manage targets"
        >
          <Settings2 className="size-4" />
        </Button>
      </div>
      {isCustom && (
        <Input
          value={endpoint}
          onChange={(e) => onEndpointChange(e.target.value)}
          onBlur={onEndpointCommit}
          placeholder={GLOBAL_DEFAULT_ENDPOINT}
          className="h-8 font-mono text-xs"
        />
      )}
      <ManageTargetsDialog open={manageOpen} onOpenChange={setManageOpen} targets={targets} />
    </Field>
  )
}

// Minimal roster: list + add + delete. Static auth fields live here, not on each dev-user.
function ManageTargetsDialog({
  open,
  onOpenChange,
  targets,
}: {
  open: boolean
  onOpenChange: (v: boolean) => void
  targets: AgentTarget[]
}) {
  const queryClient = useQueryClient()
  const [label, setLabel] = useState('')
  const [url, setUrl] = useState('')
  const [authEndpoint, setAuthEndpoint] = useState('')
  const [tokenPath, setTokenPath] = useState('')
  const invalidate = () => queryClient.invalidateQueries({ queryKey: queryKeys.datasets.targets() })

  const addMutation = useMutation({
    mutationFn: () =>
      upsertAgentTarget({
        data: {
          label: label.trim(),
          endpointUrl: url.trim(),
          config: {
            ...(authEndpoint.trim() ? { authEndpoint: authEndpoint.trim() } : {}),
            ...(tokenPath.trim() ? { tokenPath: tokenPath.trim() } : {}),
          },
        },
      }),
    onSuccess: async () => {
      await invalidate()
      setLabel('')
      setUrl('')
      setAuthEndpoint('')
      setTokenPath('')
      toast.success('Target added')
    },
    onError: (err) => toast.error(errMessage(err)),
  })

  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteAgentTarget({ data: { id } }),
    onSuccess: async () => {
      await invalidate()
      toast.success('Target removed')
    },
    onError: (err) => toast.error(errMessage(err)),
  })

  const add = () => {
    if (!label.trim()) return toast.error('Label is required')
    if (!url.trim()) return toast.error('Endpoint URL is required')
    addMutation.mutate()
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Server className="size-4" /> Agent targets
          </DialogTitle>
          <DialogDescription>
            Saved servers under test. The auth endpoint / token path live here, so a dev-user only adds credentials.
          </DialogDescription>
        </DialogHeader>

        {targets.length > 0 && (
          <ul className="flex flex-col divide-y rounded-md border">
            {targets.map((t) => (
              <li key={t.id} className="flex items-center gap-2 px-3 py-2">
                <span className="flex-1 truncate text-sm">{t.label}</span>
                <span className="truncate font-mono text-[11px] text-muted-foreground">{t.endpointUrl}</span>
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-7 text-muted-foreground hover:text-destructive"
                  onClick={() => deleteMutation.mutate(t.id)}
                >
                  <Trash2 className="size-4" />
                </Button>
              </li>
            ))}
          </ul>
        )}

        <div className="flex flex-col gap-2 rounded-md border bg-muted/20 p-3">
          <div className="grid grid-cols-2 gap-2">
            <div className="flex flex-col gap-1">
              <Label htmlFor="target-label" className="text-xs">
                Label
              </Label>
              <Input
                id="target-label"
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                placeholder="Staging"
                className="h-8"
              />
            </div>
            <div className="flex flex-col gap-1">
              <Label htmlFor="target-url" className="text-xs">
                Endpoint URL
              </Label>
              <Input
                id="target-url"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder={GLOBAL_DEFAULT_ENDPOINT}
                className="h-8 font-mono text-xs"
              />
            </div>
            <div className="flex flex-col gap-1">
              <Label htmlFor="target-auth" className="text-xs">
                Auth endpoint <span className="text-muted-foreground">(optional)</span>
              </Label>
              <Input
                id="target-auth"
                value={authEndpoint}
                onChange={(e) => setAuthEndpoint(e.target.value)}
                placeholder="…/auth/token"
                className="h-8 font-mono text-xs"
              />
            </div>
            <div className="flex flex-col gap-1">
              <Label htmlFor="target-tokenpath" className="text-xs">
                Token path <span className="text-muted-foreground">(default access_token)</span>
              </Label>
              <Input
                id="target-tokenpath"
                value={tokenPath}
                onChange={(e) => setTokenPath(e.target.value)}
                placeholder="access_token"
                className="h-8 font-mono text-xs"
              />
            </div>
          </div>
          <Button size="sm" className="self-end" disabled={addMutation.isPending} onClick={add}>
            <Plus data-icon="inline-start" />
            Add target
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
