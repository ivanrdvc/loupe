import { Check, ChevronDown, Plus } from 'lucide-react'
import { Button } from '#/components/ui/button'
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from '#/components/ui/command'
import { Popover, PopoverContent, PopoverTrigger } from '#/components/ui/popover'
import { cn } from '#/lib/utils'

interface HostFilterProps {
  value: string
  hosts: string[]
  onChange: (host: string) => void
}

export function HostFilter({ value, hosts, onChange }: HostFilterProps) {
  if (hosts.length === 0 && !value) return null
  const hasSelection = !!value
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="outline" className={cn('gap-x-1.5 border-border', !hasSelection && 'border-dashed')}>
          <Plus
            className={cn('-ml-0.5 size-4 shrink-0 transition-transform', hasSelection && 'rotate-45')}
            aria-hidden="true"
          />
          <span>Host</span>
          {hasSelection && (
            <>
              <span className="h-3.5 w-px bg-border" aria-hidden="true" />
              <span className="max-w-[10rem] truncate font-medium text-primary">{value}</span>
            </>
          )}
          <ChevronDown className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[220px] p-0" align="start">
        <Command>
          <CommandInput placeholder="Host" />
          <CommandList>
            <CommandEmpty>No results found.</CommandEmpty>
            <CommandGroup>
              {hosts.map((h) => {
                const isSelected = h === value
                return (
                  <CommandItem key={h} onSelect={() => onChange(isSelected ? '' : h)}>
                    <div
                      className={cn(
                        'flex size-4 items-center justify-center rounded-[4px] border',
                        isSelected
                          ? 'border-primary bg-primary text-primary-foreground'
                          : 'border-input [&_svg]:invisible',
                      )}
                    >
                      <Check className="size-3" aria-hidden />
                    </div>
                    <span className="truncate">{h}</span>
                  </CommandItem>
                )
              })}
            </CommandGroup>
            {hasSelection && (
              <>
                <CommandSeparator />
                <CommandGroup>
                  <CommandItem onSelect={() => onChange('')} className="justify-center text-center">
                    Clear filters
                  </CommandItem>
                </CommandGroup>
              </>
            )}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}
