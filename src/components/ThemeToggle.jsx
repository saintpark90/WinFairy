import { useState } from 'react'
import { getStoredTheme, toggleTheme } from '../lib/theme'

const SunIcon = () => (
  <svg viewBox="0 0 24 24" width={20} height={20} aria-hidden focusable="false">
    <circle cx="12" cy="12" r="4.25" fill="currentColor" />
    <g stroke="currentColor" strokeWidth="1.75" strokeLinecap="round">
      <path d="M12 2.5v2.25M12 19.25v2.25M4.5 4.5l1.6 1.6M17.9 17.9l1.6 1.6M2.5 12h2.25M19.25 12h2.25M4.5 19.5l1.6-1.6M17.9 6.1l1.6-1.6" />
    </g>
  </svg>
)

const MoonIcon = () => (
  <svg viewBox="0 0 24 24" width={20} height={20} aria-hidden focusable="false">
    <path
      fill="currentColor"
      d="M21 12.6a8.4 8.4 0 1 1-9.9-9.9 6.6 6.6 0 1 0 9.9 9.9Z"
    />
  </svg>
)

function ThemeToggle() {
  const [theme, setTheme] = useState(() => getStoredTheme())

  const isDark = theme === 'dark'

  return (
    <button
      type="button"
      className="theme-toggle"
      onClick={() => setTheme(toggleTheme())}
      aria-label={isDark ? '라이트 모드로 전환' : '다크 모드로 전환'}
      title={isDark ? '라이트 모드' : '다크 모드'}
    >
      {isDark ? <SunIcon /> : <MoonIcon />}
    </button>
  )
}

export default ThemeToggle
