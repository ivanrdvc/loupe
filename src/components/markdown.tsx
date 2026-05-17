import { memo } from 'react'
import { Streamdown } from 'streamdown'

interface MarkdownProps {
  children: string
  className?: string
}

export const Markdown = memo(function Markdown({ children, className }: MarkdownProps) {
  return (
    <Streamdown
      parseIncompleteMarkdown={false}
      shikiTheme={['github-light', 'github-dark']}
      className={['streamdown-tight break-words text-xs leading-snug text-foreground', className ?? ''].join(' ')}
    >
      {children}
    </Streamdown>
  )
})
