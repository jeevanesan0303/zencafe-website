import { useSyncExternalStore } from 'react'

export type SiteTheme = 'light' | 'dark'

const STORAGE_KEY = 'zen-theme'
const subscribers = new Set<() => void>()

const isBrowser =
  typeof window !== 'undefined' &&
  typeof document !== 'undefined'

function isTheme(value: unknown): value is SiteTheme {
  return value === 'light' || value === 'dark'
}

function createMediaQuery(): MediaQueryList | null {
  if (!isBrowser || typeof window.matchMedia !== 'function') {
    return null
  }

  return window.matchMedia('(prefers-color-scheme: dark)')
}

const mediaQuery = createMediaQuery()

function readSavedTheme(): SiteTheme | null {
  if (!isBrowser) return null

  try {
    const saved = window.localStorage.getItem(STORAGE_KEY)
    return isTheme(saved) ? saved : null
  } catch {
    return null
  }
}

function getSystemTheme(): SiteTheme {
  return mediaQuery?.matches ? 'dark' : 'light'
}

function readInitialTheme(): SiteTheme {
  const saved = readSavedTheme()

  if (saved) return saved

  if (isBrowser) {
    const root = document.documentElement
    const existing = root.dataset.theme

    if (isTheme(existing)) return existing

    if (root.classList.contains('dark')) {
      return 'dark'
    }
  }

  return getSystemTheme()
}

let currentTheme: SiteTheme = readInitialTheme()
let hasExplicitChoice = readSavedTheme() !== null

function applyDocumentTheme(theme: SiteTheme): void {
  if (!isBrowser) return

  const root = document.documentElement

  root.dataset.theme = theme
  root.classList.toggle('dark', theme === 'dark')
  root.classList.toggle('light', theme === 'light')
  root.style.colorScheme = theme
}

function updateTheme(theme: SiteTheme): void {
  const changed = currentTheme !== theme

  currentTheme = theme
  applyDocumentTheme(theme)

  if (changed) {
    subscribers.forEach((notify) => notify())
  }
}

export function setSiteTheme(theme: SiteTheme): void {
  hasExplicitChoice = true

  try {
    if (isBrowser) {
      window.localStorage.setItem(STORAGE_KEY, theme)
    }
  } catch {
    // The current page can still change without storage.
  }

  updateTheme(theme)
}

export function toggleSiteTheme(): void {
  setSiteTheme(currentTheme === 'dark' ? 'light' : 'dark')
}

function subscribe(notify: () => void): () => void {
  subscribers.add(notify)

  return () => {
    subscribers.delete(notify)
  }
}

function getSnapshot(): SiteTheme {
  return currentTheme
}

function getServerSnapshot(): SiteTheme {
  return 'light'
}

export function useSiteTheme(): SiteTheme {
  return useSyncExternalStore(
    subscribe,
    getSnapshot,
    getServerSnapshot,
  )
}

if (isBrowser) {
  applyDocumentTheme(currentTheme)

  window.addEventListener('storage', (event: StorageEvent) => {
    if (event.key !== STORAGE_KEY && event.key !== null) {
      return
    }

    try {
      if (event.storageArea !== window.localStorage) return
    } catch {
      return
    }

    const saved = readSavedTheme()
    hasExplicitChoice = saved !== null
    updateTheme(saved ?? getSystemTheme())
  })

  window.addEventListener('pageshow', () => {
    const saved = readSavedTheme()

    if (saved) {
      hasExplicitChoice = true
      updateTheme(saved)
    } else {
      applyDocumentTheme(currentTheme)
    }
  })

  const handleSystemChange = () => {
    if (!hasExplicitChoice) {
      updateTheme(getSystemTheme())
    }
  }

  if (mediaQuery) {
    if (typeof mediaQuery.addEventListener === 'function') {
      mediaQuery.addEventListener('change', handleSystemChange)
    } else if (typeof mediaQuery.addListener === 'function') {
      mediaQuery.addListener(handleSystemChange)
    }
  }
}