import { useEffect, useState } from 'react'

const COLOR_THEMES = ['loupe', 'tremor', 'neutral'] as const

export type ColorTheme = (typeof COLOR_THEMES)[number]

const COLOR_STORAGE_KEY = 'color-theme'
const DEFAULT_COLOR: ColorTheme = 'loupe'

function isColorTheme(value: string | undefined): value is ColorTheme {
  return !!value && (COLOR_THEMES as readonly string[]).includes(value)
}

export function useAppTheme() {
  const [colorTheme, setColorThemeState] = useState<ColorTheme>(DEFAULT_COLOR)

  useEffect(() => {
    const root = document.documentElement
    setColorThemeState(isColorTheme(root.dataset.theme) ? root.dataset.theme : DEFAULT_COLOR)
  }, [])

  const setColorTheme = (next: ColorTheme) => {
    setColorThemeState(next)
    const root = document.documentElement
    root.dataset.theme = next
    localStorage.setItem(COLOR_STORAGE_KEY, next)
  }

  return { colorTheme, setColorTheme }
}
