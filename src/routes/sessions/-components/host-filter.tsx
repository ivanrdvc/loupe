import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '#/components/ui/select'

const ALL = '__all__'

interface HostFilterProps {
  value: string
  hosts: string[]
  onChange: (host: string) => void
}

export function HostFilter({ value, hosts, onChange }: HostFilterProps) {
  if (hosts.length === 0 && !value) return null
  return (
    <Select value={value || ALL} onValueChange={(v) => onChange(v === ALL ? '' : v)}>
      <SelectTrigger size="sm" className="h-8 w-40" aria-label="Filter by host">
        <SelectValue placeholder="All hosts" />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={ALL}>All hosts</SelectItem>
        {hosts.map((h) => (
          <SelectItem key={h} value={h}>
            {h}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}
