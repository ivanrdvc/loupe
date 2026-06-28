import { ChevronDown, CirclePlay } from 'lucide-react'
import { useState } from 'react'
import { Spinner } from '#/components/spinner'
import { Badge } from '#/components/ui/badge'
import { Button } from '#/components/ui/button'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '#/components/ui/collapsible'
import { ScrollArea } from '#/components/ui/scroll-area'
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from '#/components/ui/select'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '#/components/ui/sheet'
import { type AgentOverrides, configSummary } from '#/features/evaluation'
import type { EvalDefinition } from '#/lib/eval/evaluation'
import { cn } from '#/lib/utils'
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
  const [configOpen, setConfigOpen] = useState(false)
  const [scoreOpen, setScoreOpen] = useState(false)
  const summary = configSummary(overrides)

  // The Score select folds judge choice + auto-judge into one control: 'none' = don't score.
  const scoreValue = autoJudge ? judgeDefId : 'none'
  const onScoreChange = (v: string) => {
    if (v === 'none') return onAutoJudgeChange(false)
    onJudgeDefChange(v)
    onAutoJudgeChange(true)
  }
  const scoreLabel =
    scoreValue === 'none'
      ? "Don't score"
      : scoreValue === 'default'
        ? 'Default correctness'
        : (evaluators.find((e) => String(e.id) === scoreValue)?.name ?? 'Custom evaluator')

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
          <SheetDescription>Call your agent on every example, then optionally score the answers.</SheetDescription>
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

            <Field label="Run as">
              <IdentitySwitcher selection={selection} onSelect={onSelectionChange} />
            </Field>

            <Collapsible open={configOpen} onOpenChange={setConfigOpen}>
              <CollapsibleTrigger className="flex w-full items-center gap-2 rounded-md py-1 text-left text-xs hover:text-foreground">
                <ChevronDown
                  className={cn('size-3.5 text-muted-foreground transition-transform', !configOpen && '-rotate-90')}
                />
                <span className="font-semibold uppercase tracking-wider text-muted-foreground">Config</span>
                <span className="flex flex-1 flex-wrap items-center gap-1">
                  {summary.length === 0 ? (
                    <span className="text-muted-foreground/60">Agent default</span>
                  ) : (
                    summary.map((b) => (
                      <Badge key={b} variant="secondary" className="font-mono text-[10px]">
                        {b}
                      </Badge>
                    ))
                  )}
                </span>
              </CollapsibleTrigger>
              <CollapsibleContent className="pt-3">
                <AgentOverridesFields overrides={overrides} onChange={onOverridesChange} />
              </CollapsibleContent>
            </Collapsible>

            <Collapsible open={scoreOpen} onOpenChange={setScoreOpen}>
              <CollapsibleTrigger className="flex w-full items-center gap-2 rounded-md py-1 text-left text-xs hover:text-foreground">
                <ChevronDown
                  className={cn('size-3.5 text-muted-foreground transition-transform', !scoreOpen && '-rotate-90')}
                />
                <span className="font-semibold uppercase tracking-wider text-muted-foreground">Score</span>
                <span className={cn('flex-1', scoreValue === 'none' && 'text-muted-foreground/60')}>{scoreLabel}</span>
              </CollapsibleTrigger>
              <CollapsibleContent className="pt-3">
                <Select value={scoreValue} onValueChange={onScoreChange}>
                  <SelectTrigger
                    className="h-8 w-full text-xs"
                    aria-label="Score"
                    title={judgeConfigured ? undefined : 'Set OPENAI_API_KEY or ANTHROPIC_API_KEY to enable scoring'}
                  >
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectGroup>
                      <SelectItem value="none">Don't score</SelectItem>
                      <SelectItem value="default" disabled={!judgeConfigured}>
                        Default correctness
                      </SelectItem>
                      {evaluators
                        .filter((e) => e.source === 'llm')
                        .map((e) => (
                          <SelectItem key={e.id} value={String(e.id)} disabled={!judgeConfigured}>
                            {e.name}
                          </SelectItem>
                        ))}
                    </SelectGroup>
                  </SelectContent>
                </Select>
              </CollapsibleContent>
            </Collapsible>
          </div>
        </ScrollArea>

        <SheetFooter className="flex-row items-center border-t">
          <Button
            variant="ghost"
            size="sm"
            className="text-xs text-muted-foreground"
            disabled={testing}
            onClick={() => {
              onEndpointCommit()
              onTest()
            }}
          >
            {testing ? <Spinner data-icon="inline-start" /> : null}
            Test
          </Button>
          <Button
            size="sm"
            className="ml-auto"
            disabled={running || disabled}
            onClick={() => {
              onEndpointCommit()
              onRun()
              setOpen(false)
            }}
          >
            {running ? <Spinner data-icon="inline-start" /> : <CirclePlay data-icon="inline-start" />}
            {running ? 'Running…' : 'Run all'}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  )
}
