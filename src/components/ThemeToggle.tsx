import * as React from 'react'
import { Moon, Sun } from 'lucide-react'
import {
  toggleSiteTheme,
  useSiteTheme,
} from '../theme'

export { useSiteTheme as useThemeMode } from '../theme'

type ThemeToggleProps = {
  className?: string
}

export default function ThemeToggle({
  className,
}: ThemeToggleProps) {
  const theme = useSiteTheme()
  const isDark = theme === 'dark'

  const label = isDark
    ? 'Switch to light mode'
    : 'Switch to dark mode'

  const homeButtonStyle: React.CSSProperties = {
    display: 'inline-grid',
    placeItems: 'center',
    flexShrink: 0,
    width: 44,
    height: 44,
    padding: 0,
    borderRadius: '50%',
    border: isDark
      ? '1px solid rgba(255,255,255,0.18)'
      : '1px solid rgba(91,55,36,0.16)',
    background: isDark
      ? 'rgba(255,255,255,0.07)'
      : 'rgba(255,255,255,0.78)',
    color: isDark ? '#f7eee7' : '#594336',
    cursor: 'pointer',
    WebkitTapHighlightColor: 'transparent',
  }

  return (
    <button
      type="button"
      className={className ?? 'zen-glass-icon'}
      style={className ? undefined : homeButtonStyle}
      onClick={toggleSiteTheme}
      aria-label={label}
      title={label}
    >
      <span
        className="zg-theme-icon"
        style={{
          display: 'grid',
          placeItems: 'center',
        }}
      >
        {isDark ? (
          <Sun size={19} aria-hidden="true" />
        ) : (
          <Moon size={19} aria-hidden="true" />
        )}
      </span>
    </button>
  )
}