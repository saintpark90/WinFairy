const THEME_STORAGE_KEY = 'winfairy-theme'

export const getStoredTheme = () => {
  try {
    const stored = localStorage.getItem(THEME_STORAGE_KEY)
    if (stored === 'light' || stored === 'dark') return stored
  } catch {
    /* ignore */
  }
  return 'light'
}

export const applyTheme = (theme) => {
  const next = theme === 'dark' ? 'dark' : 'light'
  document.documentElement.dataset.theme = next
  try {
    localStorage.setItem(THEME_STORAGE_KEY, next)
  } catch {
    /* ignore */
  }
  return next
}

/** 첫 페인트 전 호출 — 깜빡임 방지 */
export const initTheme = () => {
  applyTheme(getStoredTheme())
}

export const toggleTheme = () => {
  const current = document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light'
  return applyTheme(current === 'dark' ? 'light' : 'dark')
}
