import { type ErrorComponentProps, useRouter } from '@tanstack/react-router'
import { Button } from './ui/catalyst/button'

export function RouterError({ error, reset }: ErrorComponentProps) {
  const router = useRouter()
  const message = error instanceof Error ? error.message : String(error)

  return (
    <div className="flex h-full items-center justify-center px-6 py-16">
      <div className="w-full max-w-sm text-center">
        <h1 className="text-sm font-semibold text-zinc-950 dark:text-white">Something went wrong</h1>
        <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">Couldn’t load this view.</p>

        <pre className="mt-4 max-h-40 overflow-y-auto whitespace-pre-wrap break-words rounded bg-zinc-950/5 px-2 py-1.5 text-left font-mono text-[11px] text-zinc-700 dark:bg-white/5 dark:text-zinc-300">
          {message}
        </pre>

        <div className="mt-4 flex justify-center">
          <Button
            outline
            onClick={() => {
              reset()
              router.invalidate()
            }}
          >
            Try again
          </Button>
        </div>
      </div>
    </div>
  )
}
