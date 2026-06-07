import { useEffect, useState } from 'react'
import { Textarea } from '#/components/ui/textarea'

// JSON-or-text editor for a dataset example's golden expected output. v2 stores
// expected as a string, so this keeps the raw text (pretty-printed if it parses).
export function ExpectedOutputEditor({
  value,
  onChange,
  placeholder = 'What should the output have been? JSON or plain text.',
  rows = 4,
  autoFocus,
}: {
  value: string | null
  onChange: (value: string | null) => void
  placeholder?: string
  rows?: number
  autoFocus?: boolean
}) {
  const [text, setText] = useState(value ?? '')

  useEffect(() => {
    setText(value ?? '')
  }, [value])

  return (
    <Textarea
      value={text}
      onChange={(e) => {
        setText(e.target.value)
        const trimmed = e.target.value.trim()
        onChange(trimmed ? e.target.value : null)
      }}
      rows={rows}
      autoFocus={autoFocus}
      placeholder={placeholder}
      className="font-mono text-xs"
    />
  )
}
