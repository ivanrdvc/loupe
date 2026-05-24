import { useMemo } from 'react'
import { Input } from '#/components/ui/input'
import { Label } from '#/components/ui/label'
import type { Message } from '../-types'

const VAR_REGEX = /\{\{\s*([a-zA-Z_][a-zA-Z0-9_]*)\s*\}\}/g

export function extractVariables(messages: Message[]): string[] {
  const found = new Set<string>()
  for (const m of messages) {
    const text = m.content ?? ''
    const matches = text.matchAll(VAR_REGEX)
    for (const match of matches) {
      if (match[1]) found.add(match[1])
    }
  }
  return [...found]
}

export function substituteVariables(messages: Message[], values: Record<string, string>): Message[] {
  return messages.map((m) => ({
    ...m,
    content: (m.content ?? '').replace(VAR_REGEX, (_, name) => values[name] ?? ''),
  }))
}

export function VariablesPanel({
  variables,
  values,
  onChange,
}: {
  variables: string[]
  values: Record<string, string>
  onChange: (values: Record<string, string>) => void
}) {
  const sorted = useMemo(() => [...variables].sort(), [variables])
  if (sorted.length === 0) return null
  return (
    <div className="flex flex-col gap-2 rounded-lg border bg-card p-3">
      <div className="text-xs font-medium text-muted-foreground">Variables</div>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        {sorted.map((name) => (
          <div key={name} className="flex flex-col gap-1">
            <Label htmlFor={`var-${name}`} className="font-mono text-[11px]">
              {`{{${name}}}`}
            </Label>
            <Input
              id={`var-${name}`}
              value={values[name] ?? ''}
              onChange={(e) => onChange({ ...values, [name]: e.target.value })}
              placeholder={`Value for ${name}`}
              className="h-8 text-xs"
            />
          </div>
        ))}
      </div>
    </div>
  )
}
