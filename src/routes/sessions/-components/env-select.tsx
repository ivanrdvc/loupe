import { IconCheck, IconChevronDown } from '@tabler/icons-react'
import { ENV_OPTIONS } from '#/components/env-select'
import { Button } from '#/components/ui/button'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '#/components/ui/dropdown-menu'
import { Separator } from '#/components/ui/separator'
import { useEnv } from '#/hooks/use-env'

export function EnvSelect() {
  const [env, setEnv] = useEnv()
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm">
          <span className="text-muted-foreground">Env</span>
          <Separator orientation="vertical" className="mx-2 data-[orientation=vertical]:h-4" />
          <span>{env}</span>
          <IconChevronDown />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-32">
        {ENV_OPTIONS.map((option) => (
          <DropdownMenuItem key={option} onSelect={() => setEnv(option)}>
            <IconCheck className={env === option ? 'opacity-100' : 'opacity-0'} />
            {option}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
