import { useEffect, useState } from 'react'

function detectMac(): boolean {
  if (typeof navigator === 'undefined') return false
  const platform = (navigator as Navigator & { userAgentData?: { platform?: string } }).userAgentData?.platform
  const source = platform ?? navigator.platform ?? navigator.userAgent
  return source.toLowerCase().includes('mac')
}

export function useIsMac() {
  const [isMac, setIsMac] = useState(false)
  useEffect(() => {
    setIsMac(detectMac())
  }, [])
  return isMac
}

export function formatShortcut(isMac: boolean, key: string) {
  return isMac ? `⌘⇧${key}` : `Ctrl+Shift+${key}`
}
