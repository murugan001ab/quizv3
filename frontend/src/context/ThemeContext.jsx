import { createContext, useContext, useEffect, useMemo, useState } from 'react'

const ThemeContext = createContext(null)

const THEMES = ['space', 'midnight', 'light']

function applyTheme(theme) {
  const root = document.documentElement
  root.setAttribute('data-theme', theme)
}

export function ThemeProvider({ children }) {
  const [theme, setTheme] = useState(() => localStorage.getItem('theme') || 'space')

  useEffect(() => {
    const safeTheme = THEMES.includes(theme) ? theme : 'space'
    applyTheme(safeTheme)
    localStorage.setItem('theme', safeTheme)
  }, [theme])

  const value = useMemo(() => ({
    theme,
    setTheme,
    themes: THEMES,
  }), [theme])

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
}

export const useTheme = () => useContext(ThemeContext)
