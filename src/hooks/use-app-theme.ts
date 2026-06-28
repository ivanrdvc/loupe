import { useCallback, useEffect, useSyncExternalStore } from 'react'
import { createLocalStorageStore } from '#/lib/local-storage-store'

const COLOR_THEMES = ['loupe', 'tremor', 'neutral'] as const

export type ColorTheme = (typeof COLOR_THEMES)[number]

const COLOR_STORAGE_KEY = 'color-theme'
const DEFAULT_COLOR: ColorTheme = 'loupe'

const store = createLocalStorageStore(COLOR_STORAGE_KEY)

function isColorTheme(value: string | null | undefined): value is ColorTheme {
  return !!value && (COLOR_THEMES as readonly string[]).includes(value)
}

function readColorTheme(): ColorTheme {
  if (typeof window === 'undefined') return DEFAULT_COLOR
  const stored = window.localStorage.getItem(COLOR_STORAGE_KEY)
  return isColorTheme(stored) ? stored : DEFAULT_COLOR
}

export function useAppTheme() {
  const colorTheme = useSyncExternalStore(store.subscribe, readColorTheme, () => DEFAULT_COLOR)

  const setColorTheme = useCallback((next: ColorTheme) => {
    window.localStorage.setItem(COLOR_STORAGE_KEY, next)
    document.documentElement.dataset.theme = next
    store.notify()
  }, [])

  // Hydration strips the attribute the pre-hydration script set; re-apply it.
  useEffect(() => {
    document.documentElement.dataset.theme = colorTheme
  }, [colorTheme])

  return { colorTheme, setColorTheme }
}
