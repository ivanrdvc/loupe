import { useUserId } from '#/hooks/use-user'

export function ScopedEmptyState({ entity }: { entity: 'sessions' | 'traces' | 'spans' }) {
  const [userId] = useUserId()
  return (
    <div className="max-w-md space-y-1 text-center text-muted-foreground">
      <div>
        No {entity} for <span className="font-mono text-foreground">{userId}</span>.
      </div>
      <div className="text-xs">Turn off scope-to-me in Settings → Account to see all {entity}.</div>
    </div>
  )
}
