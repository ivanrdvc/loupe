import type { ComponentProps, ReactNode } from 'react'
import { isValidElement } from 'react'

import { cn } from '#/lib/utils'

import { JsonView } from './json-view'

type ToolInputProps = ComponentProps<'div'> & {
  input: unknown
}

export const ToolInput = ({ className, input, ...props }: ToolInputProps) => (
  <div className={cn('space-y-2 overflow-hidden', className)} {...props}>
    <h4 className="font-medium text-muted-foreground text-xs uppercase tracking-wide">Parameters</h4>
    <div className="rounded-md bg-muted/50">
      <JsonView value={input} />
    </div>
  </div>
)

type ToolOutputProps = ComponentProps<'div'> & {
  output: unknown
  errorText: string | undefined
}

export const ToolOutput = ({ className, output, errorText, ...props }: ToolOutputProps) => {
  if (output == null && !errorText) return null

  let Output: ReactNode = null
  if (output != null) {
    Output = isValidElement(output) ? <div>{output}</div> : <JsonView value={output} />
  }

  return (
    <div className={cn('space-y-2', className)} {...props}>
      <h4 className="font-medium text-muted-foreground text-xs uppercase tracking-wide">
        {errorText ? 'Error' : 'Result'}
      </h4>
      <div
        className={cn(
          'overflow-x-auto rounded-md text-xs [&_table]:w-full',
          errorText ? 'bg-destructive/10 text-destructive' : 'bg-muted/50 text-foreground',
        )}
      >
        {errorText && <div>{errorText}</div>}
        {Output}
      </div>
    </div>
  )
}
