import { CirclePlay } from 'lucide-react'
import { useState } from 'react'
import { Spinner } from '#/components/spinner'
import { Button } from '#/components/ui/button'
import { ScrollArea } from '#/components/ui/scroll-area'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '#/components/ui/select'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '#/components/ui/sheet'
import { Switch } from '#/components/ui/switch'
import type { AgentOverrides } from '#/features/evaluation'
import type { EvalDefinition } from '#/lib/eval/evaluation'
import { AgentOverridesFields } from './agent-overrides-fields'
import { type IdentitySelection, IdentitySwitcher } from './identity-switcher'
import { Field } from './run-bits'
import { TargetPicker } from './target-picker'

export function NewRunSheet({
  endpoint,
  onEndpointChange,
  onEndpointCommit,
  targetId,
  onTargetChange,
  selection,
  onSelectionChange,
  onTest,
  testing,
  overrides,
  onOverridesChange,
  evaluators,
  judgeDefId,
  onJudgeDefChange,
  autoJudge,
  onAutoJudgeChange,
  judgeConfigured,
  onRun,
  running,
  disabled,
  trigger,
}: {
  endpoint: string
  onEndpointChange: (v: string) => void
  onEndpointCommit: () => void
  targetId: string | null
  onTargetChange: (id: string | null) => void
  selection: IdentitySelection
  onSelectionChange: (s: IdentitySelection) => void
  onTest: () => void
  testing: boolean
  overrides: AgentOverrides
  onOverridesChange: (o: AgentOverrides) => void
  evaluators: EvalDefinition[]
  judgeDefId: string
  onJudgeDefChange: (v: string) => void
  autoJudge: boolean
  onAutoJudgeChange: (v: boolean) => void
  judgeConfigured: boolean
  onRun: () => void
  running: boolean
  disabled?: boolean
  trigger?: React.ReactNode
}) {
  const [open, setOpen] = useState(false)
  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        {trigger ?? (
          <Button size="sm" disabled={disabled}>
            <CirclePlay data-icon="inline-start" />
            New run
          </Button>
        )}
      </SheetTrigger>
      <SheetContent className="flex w-full flex-col gap-0 sm:max-w-md">
        <SheetHeader>
          <SheetTitle>New run</SheetTitle>
          <SheetDescription>Call your agent on every example, then optionally judge the answers.</SheetDescription>
        </SheetHeader>

        <ScrollArea className="min-h-0 flex-1">
          <div className="flex flex-col gap-4 px-4 pb-6">
            <TargetPicker
              targetId={targetId}
              onTargetChange={onTargetChange}
              endpoint={endpoint}
              onEndpointChange={onEndpointChange}
              onEndpointCommit={onEndpointCommit}
            />
            <Field label="As">
              <IdentitySwitcher selection={selection} onSelect={onSelectionChange} />
            </Field>
            <Button
              variant="ghost"
              size="sm"
              className="h-7 justify-self-start self-start px-2 text-xs text-muted-foreground"
              disabled={testing}
              onClick={() => {
                onEndpointCommit()
                onTest()
              }}
            >
              {testing ? <Spinner data-icon="inline-start" /> : null}
              Test connection
            </Button>

            <AgentOverridesFields overrides={overrides} onChange={onOverridesChange} />

            <Field label="Judge">
              <Select value={judgeDefId} onValueChange={onJudgeDefChange}>
                <SelectTrigger className="h-8 w-full text-xs" aria-label="Judge">
                  <SelectValue placeholder="Default correctness" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="default">Default correctness</SelectItem>
                  {evaluators
                    .filter((e) => e.source === 'llm')
                    .map((e) => (
                      <SelectItem key={e.id} value={String(e.id)}>
                        {e.name}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </Field>

            <label
              htmlFor="auto-judge"
              className="flex items-center gap-2 text-xs text-muted-foreground"
              title={judgeConfigured ? undefined : 'Set OPENAI_API_KEY or ANTHROPIC_API_KEY to enable judging'}
            >
              <Switch
                id="auto-judge"
                checked={autoJudge}
                onCheckedChange={onAutoJudgeChange}
                disabled={!judgeConfigured}
              />
              Judge automatically after the run
            </label>
          </div>
        </ScrollArea>

        <SheetFooter className="flex-row justify-end gap-2 border-t">
          <Button variant="outline" size="sm" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button
            size="sm"
            disabled={running || disabled}
            onClick={() => {
              onEndpointCommit()
              onRun()
              setOpen(false)
            }}
          >
            {running ? <Spinner data-icon="inline-start" /> : <CirclePlay data-icon="inline-start" />}
            {running ? 'Running…' : 'Run on all'}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  )
}
