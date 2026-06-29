import { CirclePlay } from 'lucide-react'
import { Spinner } from '#/components/spinner'
import { Button } from '#/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '#/components/ui/tooltip'
import { cn } from '#/lib/utils'

/** Solid brand-gradient run CTA (e.g. "Run all"). Swaps the play icon for a spinner while running. */
export function RunButton({
  running,
  loadingText,
  children,
  disabled,
  ...props
}: { running?: boolean; loadingText?: React.ReactNode } & React.ComponentProps<typeof Button>) {
  return (
    <Button variant="brand" {...props} disabled={disabled || running}>
      {running ? <Spinner data-icon="inline-start" /> : <CirclePlay data-icon="inline-start" />}
      {running && loadingText ? loadingText : children}
    </Button>
  )
}

/** Circular icon-only run trigger for table rows — reveals the brand gradient + glow on hover. */
export function RunIconButton({
  running,
  disabled,
  onClick,
  tooltip = 'Run',
}: {
  running: boolean
  disabled?: boolean
  onClick: (e: React.MouseEvent) => void
  tooltip?: React.ReactNode
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          aria-label="Run"
          disabled={disabled || running}
          onClick={onClick}
          className={cn(
            'group relative isolate grid size-7 place-items-center overflow-hidden rounded-full',
            'text-muted-foreground transition-all duration-200',
            'hover:text-white hover:shadow-[0_3px_16px_-4px_rgba(168,85,247,0.75)]',
            'disabled:pointer-events-none disabled:opacity-40',
          )}
        >
          <span
            aria-hidden
            className="run-grad absolute inset-0 -z-10 rounded-full opacity-0 transition-opacity duration-200 group-hover:opacity-100"
          />
          <span
            aria-hidden
            className="absolute inset-0 -z-10 rounded-full bg-[radial-gradient(circle_at_30%_25%,rgba(255,255,255,0.45),transparent_55%)] opacity-0 transition-opacity duration-200 group-hover:opacity-100"
          />
          {running ? <Spinner className="size-4" /> : <CirclePlay className="size-4" />}
        </button>
      </TooltipTrigger>
      <TooltipContent>{tooltip}</TooltipContent>
    </Tooltip>
  )
}
