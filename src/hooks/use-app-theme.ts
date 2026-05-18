import { useEffect, useState } from 'react'

export const COLOR_THEMES = ['pink-mauve', 'violet', 'lavender'] as const
export const APP_FONTS = ['pretendard', 'inter'] as const

export type ColorTheme = (typeof COLOR_THEMES)[number]
export type AppFont = (typeof APP_FONTS)[number]

const COLOR_STORAGE_KEY = 'color-theme'
const FONT_STORAGE_KEY = 'app-font'
const DEFAULT_COLOR: ColorTheme = 'pink-mauve'
const DEFAULT_FONT: AppFont = 'pretendard'

function isColorTheme(value: string | undefined): value is ColorTheme {
  return !!value && (COLOR_THEMES as readonly string[]).includes(value)
}

function isAppFont(value: string | undefined): value is AppFont {
  return !!value && (APP_FONTS as readonly string[]).includes(value)
}

export function useAppTheme() {
  const [colorTheme, setColorThemeState] = useState<ColorTheme>(DEFAULT_COLOR)
  const [font, setFontState] = useState<AppFont>(DEFAULT_FONT)

  // The inline script in __root.tsx already wrote dataset on <html>; mirror
  // into React state on mount so the picker UI starts in sync.
  useEffect(() => {
    const root = document.documentElement
    setColorThemeState(isColorTheme(root.dataset.theme) ? root.dataset.theme : DEFAULT_COLOR)
    setFontState(isAppFont(root.dataset.font) ? root.dataset.font : DEFAULT_FONT)
  }, [])

  const setColorTheme = (next: ColorTheme) => {
    setColorThemeState(next)
    const root = document.documentElement
    if (next === DEFAULT_COLOR) {
      delete root.dataset.theme
      localStorage.removeItem(COLOR_STORAGE_KEY)
    } else {
      root.dataset.theme = next
      localStorage.setItem(COLOR_STORAGE_KEY, next)
    }
  }

  const setFont = (next: AppFont) => {
    setFontState(next)
    const root = document.documentElement
    if (next === DEFAULT_FONT) {
      delete root.dataset.font
      localStorage.removeItem(FONT_STORAGE_KEY)
    } else {
      root.dataset.font = next
      localStorage.setItem(FONT_STORAGE_KEY, next)
    }
  }

  return { colorTheme, setColorTheme, font, setFont }
}
