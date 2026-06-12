import { Plus, Trash2 } from 'lucide-react'
import { Button } from '#/components/ui/button'
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '#/components/ui/dialog'
import { Input } from '#/components/ui/input'
import { ScrollArea } from '#/components/ui/scroll-area'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '#/components/ui/select'
import { Textarea } from '#/components/ui/textarea'
import type { AgentOverrides, ToolDecl } from '#/features/evaluation'
import { Field } from './run-bits'

const OVERRIDE_MODELS = ['gpt-4o', 'gpt-4o-mini', 'claude-sonnet-4-6']

export function countOverrides(o: AgentOverrides): number {
  return [
    o.model,
    o.temperature,
    o.top_p,
    o.max_tokens,
    o.system_prompt?.trim(),
    o.tools?.some((t) => t.name.trim()),
  ].filter((v) => v != null && v !== '' && v !== false).length
}

// Per-run overrides sent to the agent. Sampling/model/system map to native Responses
// params; tools are AG-UI client-tool declarations the agent may call (not executed here).
export function AgentOverridesDialog({
  open,
  onClose,
  overrides,
  onChange,
}: {
  open: boolean
  onClose: () => void
  overrides: AgentOverrides
  onChange: (o: AgentOverrides) => void
}) {
  const set = (patch: Partial<AgentOverrides>) => onChange({ ...overrides, ...patch })
  const tools = overrides.tools ?? []
  const setTool = (i: number, patch: Partial<ToolDecl>) =>
    set({ tools: tools.map((t, idx) => (idx === i ? { ...t, ...patch } : t)) })
  const onNum = (key: 'temperature' | 'top_p' | 'max_tokens') => (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value.trim()
    const num = Number(raw)
    set({ [key]: raw === '' || !Number.isFinite(num) ? null : num } as Partial<AgentOverrides>)
  }
  const numField = (v: number | null | undefined) => (v == null ? '' : String(v))

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>Agent overrides</DialogTitle>
          <DialogDescription>
            Applied to every example on the next run. Empty fields use the agent's defaults.
          </DialogDescription>
        </DialogHeader>
        <ScrollArea className="-mx-1 [&>[data-slot=scroll-area-viewport]]:max-h-[70vh]">
          <div className="grid gap-x-6 gap-y-4 px-1 sm:grid-cols-2">
            <Field label="Model">
              <Select
                value={overrides.model ?? 'default'}
                onValueChange={(v) => set({ model: v === 'default' ? null : v })}
              >
                <SelectTrigger className="h-8 w-full text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="default">Agent default</SelectItem>
                  {OVERRIDE_MODELS.map((m) => (
                    <SelectItem key={m} value={m} className="font-mono text-xs">
                      {m}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>

            <Field label="Sampling">
              <div className="flex gap-2">
                {(['temperature', 'top_p', 'max_tokens'] as const).map((key) => (
                  <div key={key} className="flex min-w-0 flex-1 flex-col gap-1">
                    <span className="truncate font-mono text-[10px] text-muted-foreground">{key}</span>
                    <Input
                      value={numField(overrides[key])}
                      onChange={onNum(key)}
                      placeholder="default"
                      inputMode={key === 'max_tokens' ? 'numeric' : 'decimal'}
                      className="h-8 font-mono text-xs placeholder:font-sans"
                    />
                  </div>
                ))}
              </div>
            </Field>

            <div className="sm:col-span-2">
              <Field label="System prompt">
                <Textarea
                  rows={2}
                  value={overrides.system_prompt ?? ''}
                  onChange={(e) => set({ system_prompt: e.target.value || null })}
                  placeholder="Override the agent's system prompt…"
                  className="min-h-16 text-xs"
                />
              </Field>
            </div>

            <div className="sm:col-span-2">
              <Field label="Tools">
                <p className="text-[11px] text-muted-foreground">
                  Client tool declarations sent to the agent (AG-UI shape). The agent may call them; results aren't
                  executed here.
                </p>
                {tools.map((t, i) => (
                  // biome-ignore lint/suspicious/noArrayIndexKey: positional tool rows
                  <div key={i} className="flex items-center gap-1.5">
                    <Input
                      value={t.name}
                      onChange={(e) => setTool(i, { name: e.target.value })}
                      placeholder="tool_name"
                      className="h-8 font-mono text-xs"
                    />
                    <Input
                      value={t.description ?? ''}
                      onChange={(e) => setTool(i, { description: e.target.value })}
                      placeholder="what it does"
                      className="h-8 text-xs"
                    />
                    <button
                      type="button"
                      className="text-muted-foreground hover:text-destructive"
                      onClick={() => set({ tools: tools.filter((_, idx) => idx !== i) })}
                    >
                      <Trash2 className="size-4" />
                    </button>
                  </div>
                ))}
                <Button
                  variant="outline"
                  size="sm"
                  className="self-start"
                  onClick={() => set({ tools: [...tools, { name: '' }] })}
                >
                  <Plus data-icon="inline-start" />
                  Tool
                </Button>
              </Field>
            </div>
          </div>
        </ScrollArea>
        <DialogFooter>
          <Button variant="outline" onClick={() => onChange({})}>
            Reset
          </Button>
          <DialogClose asChild>
            <Button>Done</Button>
          </DialogClose>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
