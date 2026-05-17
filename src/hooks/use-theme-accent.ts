import { useEffect, useState } from 'react'

export const ACCENTS = [
  'default',
  'blue',
  'green',
  'amber',
  'rose',
  'purple',
  'orange',
  'teal',
  'red',
  'yellow',
  'violet',
] as const

export type ThemeAccent = (typeof ACCENTS)[number]

const STORAGE_KEY = 'theme-accent'
const DEFAULT_ACCENT: ThemeAccent = 'default'

function isAccent(value: string | null): value is ThemeAccent {
  return value !== null && (ACCENTS as readonly string[]).includes(value)
}

function applyAccent(accent: ThemeAccent) {
  const root = document.documentElement
  if (accent === 'default') {
    root.removeAttribute('data-theme')
  } else {
    root.setAttribute('data-theme', accent)
  }
}

export function useThemeAccent() {
  const [accent, setAccentState] = useState<ThemeAccent>(DEFAULT_ACCENT)

  useEffect(() => {
    const stored = window.localStorage.getItem(STORAGE_KEY)
    const initial = isAccent(stored) ? stored : DEFAULT_ACCENT
    setAccentState(initial)
    applyAccent(initial)
  }, [])

  function setAccent(next: ThemeAccent) {
    setAccentState(next)
    applyAccent(next)
    if (next === DEFAULT_ACCENT) {
      window.localStorage.removeItem(STORAGE_KEY)
    } else {
      window.localStorage.setItem(STORAGE_KEY, next)
    }
  }

  return { accent, setAccent }
}
