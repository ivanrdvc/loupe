import { Link } from '@tanstack/react-router'

export function ToolLink({ name, className }: { name: string; className?: string }) {
  return (
    <Link
      to="."
      search={((prev: Record<string, unknown>) => ({ ...prev, tool: name })) as unknown as never}
      className={className ?? 'text-sm font-medium underline-offset-4 decoration-muted-foreground/40 hover:underline'}
    >
      {name}
    </Link>
  )
}
