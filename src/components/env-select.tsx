import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '#/components/ui/select'
import { Separator } from '#/components/ui/separator'

export const ENV_OPTIONS = ['main', 'dev'] as const
export type Env = (typeof ENV_OPTIONS)[number]

interface EnvSelectProps {
  value: Env
  onChange: (value: Env) => void
  options?: readonly Env[]
}

export function EnvSelect({ value, onChange, options = ENV_OPTIONS }: EnvSelectProps) {
  return (
    <Select value={value} onValueChange={(v) => onChange(v as Env)}>
      <SelectTrigger size="sm" className="border-border bg-transparent">
        <span className="text-muted-foreground">Env</span>
        <Separator orientation="vertical" className="data-[orientation=vertical]:h-3.5" />
        <SelectValue />
      </SelectTrigger>
      <SelectContent position="popper" align="end">
        {options.map((option) => (
          <SelectItem key={option} value={option}>
            {option}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}
