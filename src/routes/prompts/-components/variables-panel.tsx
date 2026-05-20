import { useMemo } from 'react'
import { Input } from '#/components/ui/input'
import { Label } from '#/components/ui/label'
import type { Message } from '../-types'

const VAR_RE = /\{\{(\w+)\}\}/g

export function discoverVariables(messages: Message[]): string[] {
  const found = new Set<string>()
  for (const msg of messages) {
    for (const match of msg.content.matchAll(VAR_RE)) {
      found.add(match[1])
    }
  }
  return [...found].sort()
}

export function VariablesPanel({
  messages,
  values,
  onChange,
}: {
  messages: Message[]
  values: Record<string, string>
  onChange: (next: Record<string, string>) => void
}) {
  const variables = useMemo(() => discoverVariables(messages), [messages])

  return (
    <div className="flex flex-col gap-2">
      <h3 className="text-sm font-medium">Variables</h3>
      {variables.length === 0 ? (
        <p className="text-xs text-muted-foreground">
          No variables. Use <code className="rounded bg-muted px-1 py-0.5 font-mono text-[11px]">{'{{name}}'}</code>{' '}
          syntax.
        </p>
      ) : (
        <div className="flex flex-col gap-2">
          {variables.map((name) => (
            <div key={name} className="flex flex-col gap-1">
              <Label htmlFor={`var-${name}`} className="font-mono text-xs">
                {name}
              </Label>
              <Input
                id={`var-${name}`}
                className="h-8"
                value={values[name] ?? ''}
                onChange={(e) => onChange({ ...values, [name]: e.target.value })}
                placeholder=""
              />
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
