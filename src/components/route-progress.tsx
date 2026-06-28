import { useRouterState } from '@tanstack/react-router'
import { cn } from '#/lib/utils'

/** Thin brand-gradient bar that slides across the top while the router resolves a navigation. */
export function RouteProgress() {
  const loading = useRouterState({ select: (s) => s.status === 'pending' })
  return (
    <div
      aria-hidden
      className={cn(
        'pointer-events-none fixed inset-x-0 top-0 z-[200] h-0.5 overflow-hidden transition-opacity duration-300',
        loading ? 'opacity-100' : 'opacity-0',
      )}
    >
      {loading && <div className="run-grad h-full w-2/5 animate-route-progress rounded-full" />}
    </div>
  )
}
