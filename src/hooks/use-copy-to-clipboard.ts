import { useCallback, useEffect, useRef, useState } from 'react'

export function useCopyToClipboard(resetMs = 1200) {
  const [copied, setCopied] = useState(false)
  const [failed, setFailed] = useState(false)
  const timerRef = useRef<number | null>(null)

  useEffect(
    () => () => {
      if (timerRef.current != null) window.clearTimeout(timerRef.current)
    },
    [],
  )

  const copy = useCallback(
    async (text: string): Promise<boolean> => {
      if (timerRef.current != null) window.clearTimeout(timerRef.current)
      try {
        await navigator.clipboard.writeText(text)
        setCopied(true)
        setFailed(false)
        timerRef.current = window.setTimeout(() => setCopied(false), resetMs)
        return true
      } catch {
        setCopied(false)
        setFailed(true)
        timerRef.current = window.setTimeout(() => setFailed(false), resetMs)
        return false
      }
    },
    [resetMs],
  )

  return { copied, failed, copy }
}
