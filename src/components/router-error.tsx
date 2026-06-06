import { type ErrorComponentProps, useRouter } from '@tanstack/react-router'
import { errMessage } from '#/lib/format'
import { Button } from './ui/button'

export function RouterError({ error, reset }: ErrorComponentProps) {
  const router = useRouter()
  const message = errMessage(error)

  return (
    <div className="flex h-full items-center justify-center px-6 py-16">
      <div className="w-full max-w-sm text-center">
        <h1 className="text-sm font-semibold text-foreground">Something went wrong</h1>
        <p className="mt-1 text-xs text-muted-foreground">Couldn’t load this view.</p>

        <pre className="mt-4 max-h-40 overflow-y-auto whitespace-pre-wrap break-words rounded bg-muted px-2 py-1.5 text-left font-mono text-[11px] text-muted-foreground">
          {message}
        </pre>

        <div className="mt-4 flex justify-center">
          <Button
            variant="outline"
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
